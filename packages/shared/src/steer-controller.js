/**
 * Cooperative pause between agent steps — does not abort tools or close browser tabs.
 */
export class SteerController {
    pendingMessage = null;
    /** User sent a related message — agent picks this up before the next think/plan step. */
    requestSteer(message) {
        const trimmed = message.trim();
        if (trimmed)
            this.pendingMessage = trimmed;
    }
    hasPending() {
        return this.pendingMessage !== null;
    }
    /** Consume pending steering (called by agent between steps). */
    takeSteering() {
        if (!this.pendingMessage)
            return null;
        const msg = this.pendingMessage;
        this.pendingMessage = null;
        return msg;
    }
    clear() {
        this.pendingMessage = null;
    }
}
//# sourceMappingURL=steer-controller.js.map