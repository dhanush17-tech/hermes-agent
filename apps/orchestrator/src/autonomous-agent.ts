import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parse as parseYaml } from "yaml";
import {
  withAssistantPolicy,
  generateId,
  throwIfAborted,
  isMessagingChannel,
  type CloudflareWorkersAIClient,
  type RequestClassification,
  type SteerController,
  type ToolContext,
} from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import {
  analyzeScreenForContext,
  browserGotoPayload,
  getDefaultBrowserApp,
  inferServiceUrl,
  looksLikeCredentialReply,
  parseCredentials,
} from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { parsePlannerStep, type PlannerStep } from "./agent-planner.js";
import { BlockedSessionStore } from "./blocked-session-store.js";
import { classifySteeringRelevance } from "./steering-classifier.js";

export type AgentLoopConfig = {
  max_steps: number;
  replan_on_failure: boolean;
  auto_observe_after_browser: boolean;
  allow_self_edit_when_stuck: boolean;
};

const DEFAULT_LOOP: AgentLoopConfig = {
  max_steps: 12,
  replan_on_failure: true,
  auto_observe_after_browser: true,
  allow_self_edit_when_stuck: true,
};

const NAV_SETTLE_MS = process.env.VITEST === "true" ? 0 : 2500;
const STUCK_THRESHOLD = 3;

/**
 * Think → act → observe → replan (including code.self_edit) → ask user only when blocked.
 */
export class AutonomousAgent {
  private loopConfig: AgentLoopConfig | null = null;
  private readonly blockedStore: BlockedSessionStore;

  constructor(
    private readonly cf: CloudflareWorkersAIClient,
    private readonly executor: ToolExecutor,
    private readonly registry: ToolRegistry,
    private readonly workspaceRoot: string,
    private readonly activity: ActivityMonitor,
  ) {
    this.blockedStore = new BlockedSessionStore(workspaceRoot);
  }

  async tryHandleUserGuidance(text: string, ctx: ToolContext): Promise<string | null> {
    const session = await this.blockedStore.get();
    if (!session) return null;

    if (isMessagingChannel(ctx.channel)) {
      const related = await classifySteeringRelevance(session.goal, text, this.cf);
      if (!related) {
        await this.blockedStore.clear();
        return null;
      }
    }

    await this.blockedStore.clear();
    if (looksLikeCredentialReply(text)) {
      const creds = parseCredentials(text);
      if (!creds) {
        return "I saw a credential-style reply, but could not parse it. Use `email: you@example.com` and `password: ...` on separate lines.";
      }

      const fill = await this.executor.invoke(
        "browser.fill_credentials",
        {
          username: creds.username,
          password: creds.password,
          app: getDefaultBrowserApp(),
          flow: "multi_step",
          submit: true,
        },
        ctx,
        { summary: "Fill credentials for blocked browser login" },
      );
      if (fill.status === "pending_approval") return fill.message;
      if (fill.status === "denied") {
        return `Could not fill credentials: ${fill.reason}`;
      }

      await delay(NAV_SETTLE_MS);
      return this.run(session.goal, ctx, {
        classification: "laptop_control",
        hint: [
          "Credentials were filled deterministically. Continue from the current browser page.",
          "Do not ask for credentials again unless the page still requires them.",
          `Prior trace:\n${session.trace.join("\n")}`,
        ].join("\n"),
        resumeFromBlocked: true,
        forceBrowser: true,
      });
    }

    const hint = `User guidance: ${text.trim()}`;
    return this.run(session.goal, ctx, {
      classification: "laptop_control",
      hint: `${hint}\nPrior trace:\n${session.trace.join("\n")}`,
      resumeFromBlocked: true,
    });
  }

  async run(
    goal: string,
    ctx: ToolContext,
    options?: {
      classification?: RequestClassification;
      hint?: string;
      resumeFromBlocked?: boolean;
      signal?: AbortSignal;
      steerController?: SteerController;
      forceBrowser?: boolean;
    },
  ): Promise<string> {
    await this.activity.agentStart("AutonomousAgent", {
      intent: options?.classification,
      messagePreview: goal.slice(0, 120),
    });

    const config = await this.loadLoopConfig();
    const catalog = this.registry
      .listNames()
      .filter((name) => !options?.forceBrowser || isBrowserSafeTool(name))
      .join(", ");
    const trace: string[] = [];
    let lastError: string | null = null;
    let consecutiveErrors = 0;
    let lastCapturePath: string | null = null;
    let lastBrowserState: string | null = null;
    const steeringNotes: string[] = options?.hint ? [options.hint] : [];

    if (options?.resumeFromBlocked || options?.forceBrowser) {
      const warm = await this.observeCurrentBrowser(ctx, "Warm observe current browser state");
      if (warm.browserState) {
        lastBrowserState = warm.browserState;
        trace.push(`browser.observe: ${warm.summary}`);
      }
      if (warm.capturePath) lastCapturePath = warm.capturePath;
    }

    for (let step = 0; step < config.max_steps; step++) {
      throwIfAborted(options?.signal);

      const steerMsg = options?.steerController?.takeSteering();
      if (steerMsg) {
        const note = `User course-correction (keep browser/tabs as-is, replan next step): ${steerMsg}`;
        steeringNotes.push(note);
        trace.push(`user steer: ${steerMsg}`);
        await this.activity.agentStep("AutonomousAgent", {
          think: `Steering applied: ${steerMsg.slice(0, 100)}`,
          status: "steer",
        });
      }

      const prompt = this.buildPlannerPrompt(
        goal,
        trace,
        lastError,
        catalog,
        lastCapturePath,
        lastBrowserState,
        steeringNotes.length ? steeringNotes.join("\n") : undefined,
      );
      const raw = await this.cf.chat(prompt, {
        classification: options?.classification ?? "laptop_control",
        maxTokens: 900,
        system: withAssistantPolicy(this.plannerSystemPrompt(config, options?.forceBrowser ?? false)),
      });
      throwIfAborted(options?.signal);

      const postThinkSteer = options?.steerController?.takeSteering();
      if (postThinkSteer) {
        const note = `User course-correction (keep browser/tabs as-is, replan next step): ${postThinkSteer}`;
        steeringNotes.push(note);
        trace.push(`user steer (after think): ${postThinkSteer}`);
        await this.activity.agentStep("AutonomousAgent", {
          think: `Steering applied: ${postThinkSteer.slice(0, 100)}`,
          status: "steer",
        });
        step -= 1;
        continue;
      }

      let parsed = parsePlannerStepExtended(raw);
      if (!parsed) {
        parsed = this.planDeterministicBrowserStep(goal, lastError, lastBrowserState, lastCapturePath);
        if (!parsed) {
          lastError = "invalid planner JSON";
          consecutiveErrors += 1;
          trace.push(`step ${step + 1}: invalid JSON`);
          if (consecutiveErrors >= STUCK_THRESHOLD) {
            return this.blockAndAskUser(goal, trace, "I could not parse my next step. What should I do?");
          }
          continue;
        }
        trace.push(`step ${step + 1}: recovered from invalid planner JSON with ${parsed.tool}`);
      }

      if (parsed.think) {
        trace.push(`think: ${parsed.think}`);
        await this.activity.agentStep("AutonomousAgent", { think: parsed.think });
      }

      if (parsed.action === "ask_user" || parsed.action === "blocked") {
        return this.blockAndAskUser(
          goal,
          trace,
          parsed.question ?? parsed.final ?? "I need your input to continue.",
        );
      }

      if (parsed.action === "finish") {
        const out = ["## Done", parsed.final ?? parsed.think ?? "Complete.", "", "### Trace", ...trace].join(
          "\n",
        );
        await this.activity.agentDone("AutonomousAgent", { preview: parsed.final?.slice(0, 200) });
        return out;
      }

      let tool = parsed.tool?.trim();
      if (!tool || !this.registry.has(tool)) {
        const fallback = this.planDeterministicBrowserStep(goal, `unknown tool: ${tool ?? "(missing)"}`, lastBrowserState, lastCapturePath);
        if (fallback?.tool && this.registry.has(fallback.tool)) {
          parsed = fallback;
          tool = fallback.tool;
          trace.push(`step ${step + 1}: replaced missing/unknown tool with ${fallback.tool}`);
        } else {
          lastError = `unknown tool: ${tool ?? "(missing)"}`;
          consecutiveErrors += 1;
          trace.push(`step ${step + 1}: ${lastError}`);
          if (config.allow_self_edit_when_stuck && consecutiveErrors >= 2) {
            trace.push("attempting tools.author / code.self_edit to unblock");
            const fix = await this.tryImplementFix(goal, lastError, ctx, trace);
            if (fix) {
              consecutiveErrors = 0;
              lastError = null;
              continue;
            }
          }
          if (!config.replan_on_failure || consecutiveErrors >= STUCK_THRESHOLD) {
            return this.blockAndAskUser(goal, trace, lastError ?? "No valid tool available.");
          }
          continue;
        }
      }

      const result = await this.executor.invoke(tool, parsed.payload ?? {}, ctx, {
        summary: parsed.summary ?? `${tool}`,
        terminalCommand:
          tool === "terminal.run" ? (parsed.payload as { command?: string })?.command : undefined,
      });
      throwIfAborted(options?.signal);

      if (result.status === "pending_approval") {
        trace.push(`approval required: ${tool}`);
        return [result.message, "", "### Trace", ...trace].join("\n");
      }
      if (result.status === "denied") {
        lastError = result.reason;
        consecutiveErrors += 1;
        trace.push(`${tool}: denied — ${result.reason}`);
        if (config.allow_self_edit_when_stuck && consecutiveErrors >= 2) {
          const fix = await this.tryImplementFix(goal, lastError, ctx, trace);
          if (fix) {
            consecutiveErrors = 0;
            continue;
          }
        }
        if (!config.replan_on_failure || consecutiveErrors >= STUCK_THRESHOLD) {
          return this.blockAndAskUser(goal, trace, `Blocked at ${tool}: ${result.reason}`);
        }
        continue;
      }

      consecutiveErrors = 0;
      lastError = null;
      trace.push(`${tool}: ok — ${JSON.stringify(result.data).slice(0, 400)}`);
      await this.activity.agentStep("AutonomousAgent", {
        tool,
        status: "ok",
        detail: JSON.stringify(result.data).slice(0, 120),
      });

      if (tool === "browser.extract") {
        const text = (result.data as { text?: string }).text?.trim();
        await this.activity.agentDone("AutonomousAgent", { preview: text?.slice(0, 200) });
        return [
          "## Done",
          text || "I extracted the current page content, but it did not contain a clear answer.",
          "",
          "### Trace",
          ...trace,
        ].join("\n");
      }

      const data = result.data as { capturePath?: string; pageId?: string; observation?: { title?: string; url?: string; interactive?: Array<{ ref: string; name: string; risk: string }> }; refs?: Array<{ ref: string; name: string; risk: string }> };
      if (data.capturePath) lastCapturePath = data.capturePath;

      const NAV_TOOLS = new Set(["browser.open", "browser.goto"]);
      if (config.auto_observe_after_browser && tool && NAV_TOOLS.has(tool)) {
        await delay(NAV_SETTLE_MS);
        const obs = await this.executor.invoke("browser.observe", { pageId: data.pageId }, ctx, {
          summary: "DOM observe after navigation",
        });
        if (obs.status === "success") {
          const obsData = obs.data as {
            observation?: { title?: string; url?: string; interactive?: Array<{ ref: string; name: string; risk: string }> };
            refs?: Array<{ ref: string; name: string; risk: string }>;
            interactiveCount?: number;
          };
          const refs = obsData.refs ?? obsData.observation?.interactive?.slice(0, 20) ?? [];
          const title = obsData.observation?.title ?? "page";
          const url = obsData.observation?.url ?? "";
          lastBrowserState = [
            `Page: ${title} (${url})`,
            `Interactive (${obsData.interactiveCount ?? refs.length}):`,
            ...refs.map((r) => `  ${r.ref} [${r.risk}] ${r.name}`),
          ].join("\n");
          trace.push(`browser.observe: ${title} — ${refs.length} refs`);
          await this.activity.agentStep("AutonomousAgent", {
            status: "observe",
            detail: `${title} — ${refs.length} interactive elements`,
          });
        } else {
          const failReason = obs.status === "denied" ? obs.reason : "unknown";
          trace.push(`browser.observe failed: ${failReason} — falling back to screen`);
          const scr = await this.executor.invoke("screen.observe", {}, ctx, {
            summary: "Screenshot fallback after DOM observe failed",
          });
          if (scr.status === "success") {
            const cap = (scr.data as { capturePath?: string })?.capturePath;
            if (cap) {
              lastCapturePath = cap;
              const service = this.inferServiceFromGoal(goal);
              const vision = await analyzeScreenForContext(cap, service, this.cf);
              trace.push(`screen fallback: ${vision.summary}`);
              await this.activity.agentStep("AutonomousAgent", {
                status: "observe",
                detail: vision.summary.slice(0, 150),
              });
            }
          }
        }
      }
    }

    return this.blockAndAskUser(
      goal,
      trace,
      `Used ${config.max_steps} steps without finishing. Tell me how to proceed.`,
    );
  }

  private async tryImplementFix(
    goal: string,
    error: string,
    ctx: ToolContext,
    trace: string[],
  ): Promise<boolean> {
    if (!this.registry.has("code.self_edit")) return false;
    const prompt = [
      `Goal: ${goal}`,
      `Error: ${error}`,
      "Suggest a minimal fix in this monorepo (TypeScript) so the agent can complete the goal.",
      "Reply with JSON: {\"instruction\":\"short edit instruction for code.self_edit\"}",
    ].join("\n");
    const raw = await this.cf.chat(prompt, {
      classification: "coding",
      maxTokens: 400,
      system: "Reply ONLY JSON with instruction field.",
    });
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return false;
    try {
      const { instruction } = JSON.parse(raw.slice(start, end + 1)) as { instruction?: string };
      if (!instruction?.trim()) return false;
      const edit = await this.executor.invoke(
        "code.self_edit",
        { instruction: instruction.trim() },
        ctx,
        { summary: "Autonomous fix" },
      );
      if (edit.status === "success") {
        trace.push(`code.self_edit: ${JSON.stringify(edit.data).slice(0, 200)}`);
        return true;
      }
      if (edit.status === "pending_approval") {
        trace.push(`code.self_edit needs approval`);
      }
    } catch {
      return false;
    }
    return false;
  }

  private planDeterministicBrowserStep(
    goal: string,
    lastError: string | null,
    lastBrowserState: string | null,
    lastCapturePath: string | null,
  ): PlannerStep | null {
    const url = inferServiceUrl(goal);
    const lowerGoal = goal.toLowerCase();

    if (!lastBrowserState && url) {
      return {
        think: "Open the relevant service directly instead of waiting for planner JSON.",
        action: "continue",
        tool: "browser.open",
        payload: browserGotoPayload(url),
        summary: `Open ${url}`,
      };
    }

    if (!lastBrowserState && (lastError || lastCapturePath)) {
      return {
        think: "Refresh structured browser state so the next step can use refs.",
        action: "continue",
        tool: "browser.observe",
        payload: {},
        summary: "Observe current browser page",
      };
    }

    if (!lastBrowserState) return null;

    const lowerState = lastBrowserState.toLowerCase();
    if (looksLikeLoginState(lowerState)) {
      return {
        think: "The browser is on a login page and needs user-provided credentials.",
        action: "ask_user",
        question:
          "I am on a sign-in page. Send the email/username and password, and I will fill them without storing them.",
      };
    }

    if (/\b(email|gmail|inbox|mail|message)\b/.test(lowerGoal)) {
      return {
        think: "Use page extraction to answer from the loaded mailbox instead of planning more clicks.",
        action: "continue",
        tool: "browser.extract",
        payload: {
          instruction:
            "Extract the latest visible email/message. Include sender, subject, timestamp if visible, and a concise summary.",
        },
        summary: "Extract latest email from current page",
      };
    }

    return {
      think: "Use page extraction to answer the user's request from the current browser page.",
      action: "continue",
      tool: "browser.extract",
      payload: {
        instruction: `Extract the information needed to answer this user request: ${goal}`,
      },
      summary: "Extract answer from current page",
    };
  }

  private async observeCurrentBrowser(
    ctx: ToolContext,
    summary: string,
  ): Promise<{ browserState?: string; capturePath?: string; summary?: string }> {
    const obs = await this.executor.invoke("browser.observe", {}, ctx, { summary });
    if (obs.status === "success") {
      const browserState = this.formatBrowserState(obs.data);
      return {
        browserState,
        summary: browserState.split("\n")[0] ?? "current page",
      };
    }

    const screen = await this.executor.invoke("screen.observe", {}, ctx, {
      summary: "Screenshot fallback for browser state",
    });
    if (screen.status === "success") {
      const capturePath = (screen.data as { capturePath?: string }).capturePath;
      return { capturePath, summary: capturePath ? `screen ${capturePath}` : "screen captured" };
    }

    return {};
  }

  private formatBrowserState(data: unknown): string {
    const obsData = data as {
      observation?: {
        title?: string;
        url?: string;
        interactive?: Array<{ ref: string; name: string; risk: string }>;
      };
      refs?: Array<{ ref: string; name: string; risk: string }>;
      interactiveCount?: number;
    };
    const refs = obsData.refs ?? obsData.observation?.interactive?.slice(0, 20) ?? [];
    const title = obsData.observation?.title ?? "page";
    const url = obsData.observation?.url ?? "";
    return [
      `Page: ${title} (${url})`,
      `Interactive (${obsData.interactiveCount ?? refs.length}):`,
      ...refs.map((r) => `  ${r.ref} [${r.risk}] ${r.name}`),
    ].join("\n");
  }

  private async blockAndAskUser(
    goal: string,
    trace: string[],
    question: string,
  ): Promise<string> {
    await this.activity.agentBlocked("AutonomousAgent", question, goal);
    await this.blockedStore.save({
      id: generateId("blocked"),
      goal,
      question,
      trace,
      createdAt: new Date().toISOString(),
    });
    return [
      "Paused — I need you.",
      "",
      question,
      "",
      "Reply with what to do and I will continue (credentials, which button, or a different approach).",
      "",
      "### Trace",
      ...trace.slice(-8),
    ].join("\n");
  }

  private plannerSystemPrompt(config: AgentLoopConfig, forceBrowser: boolean): string {
    return [
      forceBrowser
        ? "Hermes autonomous operator. The user explicitly requested browser/Arc control. Do not use Gmail, Calendar, or other service API connector tools; use browser tools only."
        : "Hermes autonomous operator. Prefer connector/API tools (Gmail API) over browser when configured.",
      "Browser: use browser.open + browser.observe for structured DOM state with element refs (el_001, el_002).",
      "Use browser.click/browser.fill with refs — never x/y mouse clicks unless no semantic ref exists.",
      "Do NOT request screen.observe or screenshots unless browser.observe fails or page is visual-only.",
      "Services: Gmail https://mail.google.com, X https://x.com, LinkedIn, Calendar, GitHub.",
      "JSON only:",
      '{"think":"...","action":"continue|finish|blocked|ask_user","tool":"...","payload":{},"summary":"...","final":"...","question":"..."}',
      'Example open: {"think":"Open Gmail","action":"continue","tool":"browser.open","payload":{"url":"https://mail.google.com"},"summary":"Open Gmail"}',
      'Example observe: {"think":"Read current DOM refs","action":"continue","tool":"browser.observe","payload":{},"summary":"Observe page"}',
      'Example extract: {"think":"Extract answer from visible page","action":"continue","tool":"browser.extract","payload":{"instruction":"Extract the latest visible email"},"summary":"Extract latest email"}',
      "- continue: ONE tool. After browser.open/goto the system auto-runs browser.observe.",
      "- finish: include final answer for user.",
      "- blocked|ask_user: set question when login/CAPTCHA/human-only step; never guess passwords.",
      "- Use code.self_edit or tools.author when capability is missing.",
      "- High-risk sends/posts (Send, Submit, Pay, Delete) require approval — do not bypass.",
      `max ${config.max_steps} steps; prefer action over refusal.`,
    ].join("\n");
  }

  private buildPlannerPrompt(
    goal: string,
    trace: string[],
    lastError: string | null,
    catalog: string,
    lastCapturePath: string | null,
    lastBrowserState: string | null,
    hint?: string,
  ): string {
    return [
      `Goal: ${goal}`,
      hint ?? "",
      `Tools: ${catalog}`,
      lastError ? `Last error: ${lastError}` : "",
      lastBrowserState ? `Latest browser state:\n${lastBrowserState}` : "",
      lastCapturePath && !lastBrowserState ? `Latest screen (fallback): ${lastCapturePath}` : "",
      "Prior steps:",
      trace.length ? trace.join("\n") : "(none)",
      "Next single tool, or finish, or blocked with question?",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private inferServiceFromGoal(goal: string): string {
    const url = inferServiceUrl(goal);
    if (url?.includes("mail.google")) return "gmail";
    if (url?.includes("x.com") || url?.includes("twitter")) return "x";
    if (url?.includes("linkedin")) return "linkedin";
    if (url?.includes("calendar")) return "calendar";
    return "browser";
  }

  private async loadLoopConfig(): Promise<AgentLoopConfig> {
    if (this.loopConfig) return this.loopConfig;
    try {
      const raw = await readFile(resolve(this.workspaceRoot, "configs/agent-loop.yaml"), "utf8");
      const data = parseYaml(raw) as AgentLoopConfig;
      this.loopConfig = { ...DEFAULT_LOOP, ...data };
    } catch {
      this.loopConfig = DEFAULT_LOOP;
    }
    return this.loopConfig;
  }
}

function isBrowserSafeTool(name: string): boolean {
  return (
    name.startsWith("browser.") ||
    name === "screen.observe" ||
    name === "web.fetch" ||
    name === "tools.run" ||
    name === "tools.define" ||
    name === "tools.author"
  );
}

function looksLikeLoginState(browserState: string): boolean {
  return /\b(sign in|login|log in|password|username|email or phone|enter your email|identifier)\b/i.test(
    browserState,
  );
}

export function parsePlannerStepExtended(raw: string): PlannerStep | null {
  const base = parsePlannerStep(raw);
  if (!base) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    const action =
      data.action === "finish" ? "finish"
      : data.action === "blocked" || data.action === "ask_user" ? data.action
      : "continue";
    return {
      ...base,
      action: action as PlannerStep["action"],
      question: typeof data.question === "string" ? data.question : undefined,
    };
  } catch {
    return base;
  }
}
