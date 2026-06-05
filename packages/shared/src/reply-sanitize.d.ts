/**
 * Strip model chain-of-thought / draft scaffolding from user-facing replies.
 * GLM and similar models often emit numbered analysis before the actual message.
 */
export declare function looksLikeLeakedReasoning(text: string): boolean;
export declare function stripModelReasoning(text: string): string;
export declare function sanitizeAssistantReply(text: string): string;
export declare const MESSAGING_RETRY_SYSTEM: string;
export declare function messagingModelId(): string;
//# sourceMappingURL=reply-sanitize.d.ts.map