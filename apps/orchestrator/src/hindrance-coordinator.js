import { executeIMessageSend } from "@hermes-os/tool-executor";
import { HindranceStore } from "./hindrance-store.js";
export class HindranceCoordinator {
    activity;
    store;
    constructor(workspaceRoot, activity) {
        this.activity = activity;
        this.store = new HindranceStore(workspaceRoot);
    }
    get storeRef() {
        return this.store;
    }
    async getActive() {
        return this.store.getActive();
    }
    /** Pause background work that would fail again; notify user once. */
    async reportAndNotify(input) {
        const hindrance = await this.store.report(input);
        if (!hindrance)
            return false;
        await this.activity.agentBlocked(input.agent ?? "HermesSystem", input.question, input.issue);
        if (hindrance.userNotified)
            return true;
        await this.store.markNotified();
        const body = [
            "[Hermes] Paused — I need your help.",
            "",
            input.issue,
            "",
            input.question,
            input.resolutionHint ? `\n${input.resolutionHint}` : "",
            "",
            'Reply "continue" or "done" when fixed, or tell me what to do.',
        ]
            .filter(Boolean)
            .join("\n");
        const recipient = process.env.IMESSAGE_DEFAULT_RECIPIENT?.trim();
        if (recipient) {
            await executeIMessageSend({ body: body.slice(0, 1200), recipient });
        }
        else {
            console.warn("\n[Hermes] Hindrance (one-time):\n" + body + "\n");
        }
        return true;
    }
    /** User replied while a hindrance is active — clear and acknowledge. */
    async tryResumeFromUser(text) {
        const active = await this.store.getActive();
        if (!active)
            return null;
        const guidance = text.trim();
        if (!guidance)
            return null;
        await this.store.clear();
        return [
            "Resuming — hindrance cleared.",
            `Was blocked on: ${active.issue}`,
            guidance.length > 3 ? `Using your note: ${guidance.slice(0, 300)}` : "",
            "",
            "Continuing where I left off.",
        ]
            .filter(Boolean)
            .join("\n");
    }
    /** Skip proactive/background tasks while waiting on user for same category. */
    async shouldSkipBackgroundTask(category) {
        const active = await this.store.getActive();
        if (!active)
            return false;
        if (!category)
            return true;
        return active.category === category || category === "unknown";
    }
}
//# sourceMappingURL=hindrance-coordinator.js.map