/**
 * Cooperative pause between agent steps — does not abort tools or close browser tabs.
 */
export class SteerController {
  private pendingMessage: string | null = null;

  /** User sent a related message — agent picks this up before the next think/plan step. */
  requestSteer(message: string): void {
    const trimmed = message.trim();
    if (trimmed) this.pendingMessage = trimmed;
  }

  hasPending(): boolean {
    return this.pendingMessage !== null;
  }

  /** Consume pending steering (called by agent between steps). */
  takeSteering(): string | null {
    if (!this.pendingMessage) return null;
    const msg = this.pendingMessage;
    this.pendingMessage = null;
    return msg;
  }

  clear(): void {
    this.pendingMessage = null;
  }
}
