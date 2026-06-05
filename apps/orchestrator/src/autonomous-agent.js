import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parse as parseYaml } from "yaml";
import { withAssistantPolicy, generateId, throwIfAborted, isMessagingChannel, } from "@hermes-os/shared";
import { analyzeScreenForContext, inferServiceUrl, } from "@hermes-os/tool-executor";
import { parsePlannerStep } from "./agent-planner.js";
import { BlockedSessionStore } from "./blocked-session-store.js";
import { classifySteeringRelevance } from "./steering-classifier.js";
const DEFAULT_LOOP = {
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
    cf;
    executor;
    registry;
    workspaceRoot;
    activity;
    loopConfig = null;
    blockedStore;
    constructor(cf, executor, registry, workspaceRoot, activity) {
        this.cf = cf;
        this.executor = executor;
        this.registry = registry;
        this.workspaceRoot = workspaceRoot;
        this.activity = activity;
        this.blockedStore = new BlockedSessionStore(workspaceRoot);
    }
    async tryHandleUserGuidance(text, ctx) {
        const session = await this.blockedStore.get();
        if (!session)
            return null;
        if (isMessagingChannel(ctx.channel)) {
            const related = await classifySteeringRelevance(session.goal, text, this.cf);
            if (!related) {
                await this.blockedStore.clear();
                return null;
            }
        }
        await this.blockedStore.clear();
        const hint = `User guidance: ${text.trim()}`;
        return this.run(session.goal, ctx, {
            classification: "laptop_control",
            hint: `${hint}\nPrior trace:\n${session.trace.join("\n")}`,
            resumeFromBlocked: true,
        });
    }
    async run(goal, ctx, options) {
        await this.activity.agentStart("AutonomousAgent", {
            intent: options?.classification,
            messagePreview: goal.slice(0, 120),
        });
        const config = await this.loadLoopConfig();
        const catalog = this.registry.listNames().join(", ");
        const trace = [];
        let lastError = null;
        let consecutiveErrors = 0;
        let lastCapturePath = null;
        let lastBrowserState = null;
        const steeringNotes = options?.hint ? [options.hint] : [];
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
            const prompt = this.buildPlannerPrompt(goal, trace, lastError, catalog, lastCapturePath, lastBrowserState, steeringNotes.length ? steeringNotes.join("\n") : undefined);
            const raw = await this.cf.chat(prompt, {
                classification: options?.classification ?? "laptop_control",
                maxTokens: 900,
                system: withAssistantPolicy(this.plannerSystemPrompt(config)),
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
            const parsed = parsePlannerStepExtended(raw);
            if (!parsed) {
                lastError = "invalid planner JSON";
                consecutiveErrors += 1;
                trace.push(`step ${step + 1}: invalid JSON`);
                if (consecutiveErrors >= STUCK_THRESHOLD) {
                    return this.blockAndAskUser(goal, trace, "I could not parse my next step. What should I do?");
                }
                continue;
            }
            if (parsed.think) {
                trace.push(`think: ${parsed.think}`);
                await this.activity.agentStep("AutonomousAgent", { think: parsed.think });
            }
            if (parsed.action === "ask_user" || parsed.action === "blocked") {
                return this.blockAndAskUser(goal, trace, parsed.question ?? parsed.final ?? "I need your input to continue.");
            }
            if (parsed.action === "finish") {
                const out = ["## Done", parsed.final ?? parsed.think ?? "Complete.", "", "### Trace", ...trace].join("\n");
                await this.activity.agentDone("AutonomousAgent", { preview: parsed.final?.slice(0, 200) });
                return out;
            }
            const tool = parsed.tool?.trim();
            if (!tool || !this.registry.has(tool)) {
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
            const result = await this.executor.invoke(tool, parsed.payload ?? {}, ctx, {
                summary: parsed.summary ?? `${tool}`,
                terminalCommand: tool === "terminal.run" ? parsed.payload?.command : undefined,
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
            const data = result.data;
            if (data.capturePath)
                lastCapturePath = data.capturePath;
            const NAV_TOOLS = new Set(["browser.open", "browser.goto"]);
            if (config.auto_observe_after_browser && tool && NAV_TOOLS.has(tool)) {
                await delay(NAV_SETTLE_MS);
                const obs = await this.executor.invoke("browser.observe", { pageId: data.pageId }, ctx, {
                    summary: "DOM observe after navigation",
                });
                if (obs.status === "success") {
                    const obsData = obs.data;
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
                }
                else {
                    const failReason = obs.status === "denied" ? obs.reason : "unknown";
                    trace.push(`browser.observe failed: ${failReason} — falling back to screen`);
                    const scr = await this.executor.invoke("screen.observe", {}, ctx, {
                        summary: "Screenshot fallback after DOM observe failed",
                    });
                    if (scr.status === "success") {
                        const cap = scr.data?.capturePath;
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
        return this.blockAndAskUser(goal, trace, `Used ${config.max_steps} steps without finishing. Tell me how to proceed.`);
    }
    async tryImplementFix(goal, error, ctx, trace) {
        if (!this.registry.has("code.self_edit"))
            return false;
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
        if (start < 0 || end <= start)
            return false;
        try {
            const { instruction } = JSON.parse(raw.slice(start, end + 1));
            if (!instruction?.trim())
                return false;
            const edit = await this.executor.invoke("code.self_edit", { instruction: instruction.trim() }, ctx, { summary: "Autonomous fix" });
            if (edit.status === "success") {
                trace.push(`code.self_edit: ${JSON.stringify(edit.data).slice(0, 200)}`);
                return true;
            }
            if (edit.status === "pending_approval") {
                trace.push(`code.self_edit needs approval`);
            }
        }
        catch {
            return false;
        }
        return false;
    }
    async blockAndAskUser(goal, trace, question) {
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
    plannerSystemPrompt(config) {
        return [
            "Hermes autonomous operator. Prefer connector/API tools (Gmail API) over browser when configured.",
            "Browser: use browser.open + browser.observe for structured DOM state with element refs (el_001, el_002).",
            "Use browser.click/browser.fill with refs — never x/y mouse clicks unless no semantic ref exists.",
            "Do NOT request screen.observe or screenshots unless browser.observe fails or page is visual-only.",
            "Services: Gmail https://mail.google.com, X https://x.com, LinkedIn, Calendar, GitHub.",
            "JSON only:",
            '{"think":"...","action":"continue|finish|blocked|ask_user","tool":"...","payload":{},"summary":"...","final":"...","question":"..."}',
            "- continue: ONE tool. After browser.open/goto the system auto-runs browser.observe.",
            "- finish: include final answer for user.",
            "- blocked|ask_user: set question when login/CAPTCHA/human-only step; never guess passwords.",
            "- Use code.self_edit or tools.author when capability is missing.",
            "- High-risk sends/posts (Send, Submit, Pay, Delete) require approval — do not bypass.",
            `max ${config.max_steps} steps; prefer action over refusal.`,
        ].join("\n");
    }
    buildPlannerPrompt(goal, trace, lastError, catalog, lastCapturePath, lastBrowserState, hint) {
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
    inferServiceFromGoal(goal) {
        const url = inferServiceUrl(goal);
        if (url?.includes("mail.google"))
            return "gmail";
        if (url?.includes("x.com") || url?.includes("twitter"))
            return "x";
        if (url?.includes("linkedin"))
            return "linkedin";
        if (url?.includes("calendar"))
            return "calendar";
        return "browser";
    }
    async loadLoopConfig() {
        if (this.loopConfig)
            return this.loopConfig;
        try {
            const raw = await readFile(resolve(this.workspaceRoot, "configs/agent-loop.yaml"), "utf8");
            const data = parseYaml(raw);
            this.loopConfig = { ...DEFAULT_LOOP, ...data };
        }
        catch {
            this.loopConfig = DEFAULT_LOOP;
        }
        return this.loopConfig;
    }
}
export function parsePlannerStepExtended(raw) {
    const base = parsePlannerStep(raw);
    if (!base)
        return null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced?.[1]?.trim() ?? raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    try {
        const data = JSON.parse(jsonText);
        const action = data.action === "finish" ? "finish"
            : data.action === "blocked" || data.action === "ask_user" ? data.action
                : "continue";
        return {
            ...base,
            action: action,
            question: typeof data.question === "string" ? data.question : undefined,
        };
    }
    catch {
        return base;
    }
}
//# sourceMappingURL=autonomous-agent.js.map