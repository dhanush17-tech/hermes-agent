/** Shared sender allowlist helpers for iMessage and approval verification. */
export declare function normalizeHandle(handle: string): string;
export declare function handleMatchKeys(handle: string): string[];
export declare function loadApprovedSendersFromEnv(): Set<string>;
export declare function isApprovedSender(handle: string, approved: Set<string>): boolean;
//# sourceMappingURL=approved-senders.d.ts.map