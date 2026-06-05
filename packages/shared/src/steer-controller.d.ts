/**
 * Cooperative pause between agent steps — does not abort tools or close browser tabs.
 */
export declare class SteerController {
    private pendingMessage;
    /** User sent a related message — agent picks this up before the next think/plan step. */
    requestSteer(message: string): void;
    hasPending(): boolean;
    /** Consume pending steering (called by agent between steps). */
    takeSteering(): string | null;
    clear(): void;
}
//# sourceMappingURL=steer-controller.d.ts.map