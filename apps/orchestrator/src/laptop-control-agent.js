import { setTimeout as delay } from "node:timers/promises";
import { generateId } from "@hermes-os/shared";
import { wantsExplicitTweet } from "@hermes-os/shared";
import { inferServiceUrl, twitterComposeUrl, browserGotoPayload, getDefaultBrowserApp, parseCredentials, looksLikeCredentialReply, analyzeScreenForLogin, } from "@hermes-os/tool-executor";
import { LoginSessionStore } from "./login-session-store.js";
const NAV_SETTLE_MS = process.env.VITEST === "true" ? 0 : 2800;
const SKIP_LOGIN_DETECT = process.env.VITEST === "true" || process.env.HERMES_SKIP_LOGIN_DETECT === "1";
export class LaptopControlAgent {
    executor;
    cf;
    sessions;
    constructor(executor, cf, workspaceRoot) {
        this.executor = executor;
        this.cf = cf;
        this.sessions = new LoginSessionStore(workspaceRoot);
    }
    /** Resume after user sends credentials (orchestrator calls before intent routing). */
    async tryHandleCredentialReply(text, ctx) {
        const session = await this.sessions.get();
        if (!session)
            return null;
        if (!looksLikeCredentialReply(text)) {
            return [
                `Paused: ${session.service} in Arc needs sign-in.`,
                `Reply with credentials, for example:`,
                `username: you@example.com`,
                `password: your-password`,
                `(Or one line: you@example.com / your-password)`,
            ].join("\n");
        }
        const creds = parseCredentials(text);
        if (!creds) {
            return "Could not parse credentials. Use username: … and password: … on separate lines.";
        }
        const fill = await this.invokeTool("browser.fill_credentials", {
            username: creds.username,
            password: creds.password,
            app: getDefaultBrowserApp(),
        }, ctx, `Sign in to ${session.service} in Arc`);
        if (fill.pending)
            return fill.pending;
        if (fill.denied)
            return `Could not fill login in Arc: ${fill.denied}`;
        await this.sessions.clear();
        await delay(NAV_SETTLE_MS);
        return this.run(session.originalText, session.entities, ctx, {
            preferCompose: session.preferCompose,
            skipLoginPause: true,
        });
    }
    async run(text, entities, ctx, options) {
        const browser = getDefaultBrowserApp();
        const parts = [`Using Arc (${browser}) + screen control — no service APIs.`];
        const before = await this.invokeTool("screen.observe", {}, ctx, "Capture screen before navigation");
        if (before.pending)
            return before.pending;
        if (before.path)
            parts.push(`Screen: ${before.path}`);
        const url = this.resolveUrl(text, entities, options?.preferCompose);
        if (url) {
            const nav = await this.invokeTool("browser.goto", browserGotoPayload(url), ctx, `Open ${url} in Arc`);
            if (nav.pending)
                return nav.pending;
            if (nav.denied)
                parts.push(`Navigation failed: ${nav.denied}`);
            else
                parts.push(`Opened in Arc: ${url}`);
            const skipLogin = options?.skipLoginPause ||
                SKIP_LOGIN_DETECT ||
                entities?.toolName === "social.post" ||
                options?.preferCompose;
            if (!skipLogin) {
                await delay(NAV_SETTLE_MS);
                const afterNav = await this.invokeTool("screen.observe", {}, ctx, "Capture screen after navigation");
                if (afterNav.pending)
                    return afterNav.pending;
                const capturePath = afterNav.path ?? before.path;
                if (capturePath) {
                    const login = await analyzeScreenForLogin(capturePath, url, this.cf);
                    if (login.loginRequired) {
                        const service = login.service ?? this.inferServiceLabel(url);
                        const session = {
                            id: generateId("login"),
                            service,
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
        }
        else {
            parts.push("Say which site or app to open (e.g. Gmail, calendar, a link).");
        }
        const after = await this.invokeTool("screen.observe", {}, ctx, "Capture screen after navigation");
        if (after.pending)
            return after.pending;
        if (after.path)
            parts.push(`Updated screen: ${after.path}`);
        if (entities?.toolName === "social.post" && wantsExplicitTweet(text)) {
            const draft = entities?.payloadText?.trim() || text.trim();
            const post = await this.invokeTool("social.post", { text: draft, platform: "x" }, ctx, "Post via Arc (not API)");
            if (post.pending)
                return post.pending;
            if (post.data)
                parts.push(`Post step: ${JSON.stringify(post.data)}`);
        }
        if (this.cf && (before.path || after.path)) {
            const hint = await this.cf.chat(text, {
                maxTokens: 400,
                classification: "laptop_control",
                system: "User tasks use Arc browser and screen capture on their Mac. Give 2-4 short next steps (what to verify or click). Do not ask for API keys.",
            });
            parts.push("\n## Next steps\n", hint);
        }
        return parts.join("\n");
    }
    inferServiceLabel(url) {
        try {
            const host = new URL(url).hostname.replace(/^www\./, "");
            return host.split(".")[0] ?? "service";
        }
        catch {
            return "service";
        }
    }
    resolveUrl(text, entities, preferCompose) {
        if (entities?.url)
            return entities.url;
        if (preferCompose && entities?.toolName === "social.post" && wantsExplicitTweet(text)) {
            const body = entities?.payloadText?.trim();
            return twitterComposeUrl(body || undefined);
        }
        return inferServiceUrl(text);
    }
    async invokeTool(toolName, payload, ctx, summary) {
        const result = await this.executor.invoke(toolName, payload, ctx, { summary });
        if (result.status === "pending_approval")
            return { pending: result.message };
        if (result.status === "denied")
            return { denied: result.reason };
        const data = result.data;
        return { path: data.capturePath, data: result.data };
    }
}
//# sourceMappingURL=laptop-control-agent.js.map