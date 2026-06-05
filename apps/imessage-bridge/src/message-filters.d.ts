/** Inbound SMS/iMessage that should never trigger Hermes (OTP, banks, Apple, etc.). */
export declare function isAutomatedInbound(text: string, handle: string): boolean;
export declare function shouldIgnoreInbound(text: string, handle: string): boolean;
//# sourceMappingURL=message-filters.d.ts.map