import { setTimeout as delay } from "node:timers/promises";
import { generateId } from "@hermes-os/shared";
import type { IntentEntities, ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { wantsExplicitTweet } from "@hermes-os/shared";
import {
  inferServiceUrl,
  twitterComposeUrl,
  browserGotoPayload,
  getDefaultBrowserApp,
  parseCredentials,
  looksLikeCredentialReply,
  analyzeScreenForLogin,
} from "@hermes-os/tool-executor";
import { LoginSessionStore, type PendingLoginSession } from "./login-session-store.js";
import { isLoginResumeMessage, loginResumeInstructions } from "./login-resume.js";
import { isLoginSessionExpired, messageRelatesToPendingLogin } from "./login-session-utils.js";

const NAV_SETTLE_MS = process.env.VITEST === "true" ? 0 : 2800;
const SKIP_LOGIN_DETECT =
  process.env.VITEST === "true" || process.env.HERMES_SKIP_LOGIN_DETECT === "1";

export class LaptopControlAgent {
  private readonly sessions: LoginSessionStore;

  constructor(
    private readonly executor: ToolExecutor,
    workspaceRoot: string,
  ) {
    this.sessions = new LoginSessionStore(workspaceRoot);
  }

  /** Resume after user sends credentials (orchestrator calls before intent routing). */
  async tryHandleCredentialReply(text: string, _ctx: ToolContext): Promise<string | null> {
    const session = await this.sessions.get();
    if (!session) return null;

    if (isLoginSessionExpired(session)) {
      await this.sessions.clear();
      return null;
    }

    if (isLoginResumeMessage(text)) {
      return null;
    }

    if (!messageRelatesToPendingLogin(text, session)) {
      await this.sessions.clear();
      return null;
    }

    if (!looksLikeCredentialReply(text)) {
      return loginResumeInstructions(session.email ?? session.service, session.browser ?? "arc");
    }

    return [
      "I can't use passwords pasted into normal chat.",
      "Sign in manually in Arc, then reply **done**.",
    ].join("\n");
  }

  async run(
    text: string,
    entities: IntentEntities | undefined,
    ctx: ToolContext,
    options?: { preferCompose?: boolean; skipLoginPause?: boolean },
  ): Promise<string> {
    const browser = getDefaultBrowserApp();
    const parts: string[] = [`Using Arc (${browser}) + screen control — no service APIs.`];

    const before = await this.invokeTool("screen.observe", {}, ctx, "Capture screen before navigation");
    if (before.pending) return before.pending;
    if (before.path) parts.push(`Screen: ${before.path}`);

    const url = this.resolveUrl(text, entities, options?.preferCompose);
    if (url) {
      const nav = await this.invokeTool(
        "browser.goto",
        browserGotoPayload(url),
        ctx,
        `Open ${url} in Arc`,
      );
      if (nav.pending) return nav.pending;
      if (nav.denied) parts.push(`Navigation failed: ${nav.denied}`);
      else parts.push(`Opened in Arc: ${url}`);

      const skipLogin =
        options?.skipLoginPause ||
        SKIP_LOGIN_DETECT ||
        entities?.toolName === "social.post" ||
        options?.preferCompose;

      if (!skipLogin) {
        await delay(NAV_SETTLE_MS);
        const afterNav = await this.invokeTool("screen.observe", {}, ctx, "Capture screen after navigation");
        if (afterNav.pending) return afterNav.pending;

        const capturePath = afterNav.path ?? before.path;
        if (capturePath) {
          const login = await analyzeScreenForLogin(capturePath, url, null);
          if (login.loginRequired) {
            const service = login.service ?? this.inferServiceLabel(url);
            const session: PendingLoginSession = {
              id: generateId("login"),
              service,
              browser: "arc",
              url,
              originalText: text,
              entities,
              preferCompose: options?.preferCompose,
              createdAt: new Date().toISOString(),
            };
            await this.sessions.save(session);
            return [
              `Paused — ${service} sign-in detected in Arc.`,
              `Send your credentials and I will fill the form and continue:`,
              `username: your@email.com`,
              `password: ••••••••`,
              `(Credentials are used once for this step and not stored in memory.)`,
            ].join("\n");
          }
        }
      }
    } else {
      parts.push("Say which site or app to open (e.g. Gmail, calendar, a link).");
    }

    const after = await this.invokeTool("screen.observe", {}, ctx, "Capture screen after navigation");
    if (after.pending) return after.pending;
    if (after.path) parts.push(`Updated screen: ${after.path}`);

    if (entities?.toolName === "social.post" && wantsExplicitTweet(text)) {
      const draft = entities?.payloadText?.trim() || text.trim();
      const post = await this.invokeTool(
        "social.post",
        { text: draft, platform: "x" },
        ctx,
        "Post via Arc (not API)",
      );
      if (post.pending) return post.pending;
      if (post.data) parts.push(`Post step: ${JSON.stringify(post.data)}`);
    }

    return parts.join("\n");
  }

  private inferServiceLabel(url: string): string {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host.split(".")[0] ?? "service";
    } catch {
      return "service";
    }
  }

  private resolveUrl(
    text: string,
    entities: IntentEntities | undefined,
    preferCompose?: boolean,
  ): string | null {
    if (entities?.url) return entities.url;
    if (preferCompose && entities?.toolName === "social.post" && wantsExplicitTweet(text)) {
      const body = entities?.payloadText?.trim();
      return twitterComposeUrl(body || undefined);
    }
    return inferServiceUrl(text);
  }

  private async invokeTool(
    toolName: string,
    payload: unknown,
    ctx: ToolContext,
    summary: string,
  ): Promise<{ pending?: string; denied?: string; path?: string; data?: unknown }> {
    const result = await this.executor.invoke(toolName, payload, ctx, { summary });
    if (result.status === "pending_approval") return { pending: result.message };
    if (result.status === "denied") return { denied: result.reason };
    const data = result.data as { capturePath?: string };
    return { path: data.capturePath, data: result.data };
  }
}
