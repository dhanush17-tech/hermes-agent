import { randomUUID } from "node:crypto";
import { HERMES_INTERRUPTED } from "@hermes-os/shared";
/**
 * Single chat session: one message at a time, shared conversation history in the orchestrator.
 * A new message cancels any in-flight reply so follow-ups stay in the same thread.
 */
export class ChatRunManager {
    orchestrator;
    emit;
    activeRunId = null;
    activeController = null;
    activePromise = null;
    constructor(orchestrator, emit) {
        this.orchestrator = orchestrator;
        this.emit = emit;
    }
    getStatus() {
        return {
            type: "status",
            running: this.activeRunId !== null,
            runId: this.activeRunId,
            goal: null,
            parallelTasks: 0,
        };
    }
    async submit(text) {
        const trimmed = text.trim();
        if (!trimmed)
            throw new Error("Empty message");
        if (this.activeController) {
            this.activeController.abort();
            await this.activePromise?.catch(() => undefined);
        }
        const runId = randomUUID();
        const controller = new AbortController();
        this.activeRunId = runId;
        this.activeController = controller;
        this.activePromise = this.runOnce(runId, trimmed, controller);
        void this.activePromise;
        return { runId, steering: false, related: false, parallel: false };
    }
    async interrupt() {
        if (!this.activeController)
            return false;
        this.emit({
            type: "interrupted",
            runId: this.activeRunId ?? "",
            reason: "Stopped the current task.",
        });
        this.activeController.abort();
        await this.activePromise?.catch(() => undefined);
        return true;
    }
    async runOnce(runId, goal, controller) {
        this.emit({ type: "run_started", runId, goal, parallel: false });
        try {
            const reply = await this.orchestrator.handleMessage({
                channel: "imessage",
                senderId: "web-user",
                text: goal,
                receivedAt: new Date().toISOString(),
            }, { signal: controller.signal });
            if (!controller.signal.aborted) {
                this.emit({ type: "reply", runId, text: reply });
            }
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === HERMES_INTERRUPTED || controller.signal.aborted)
                return;
            this.emit({ type: "error", runId, message: msg });
        }
        finally {
            if (this.activeRunId === runId) {
                this.activeRunId = null;
                this.activeController = null;
                this.activePromise = null;
            }
            this.emit({ type: "run_finished", runId });
            this.emit(this.getStatus());
        }
    }
}
//# sourceMappingURL=run-manager.js.map