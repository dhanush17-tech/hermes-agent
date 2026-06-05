export type ResearchSession = {
    topic: string;
    lastReply?: string;
    lastLinks?: string[];
};
/** User wants to open a product page in Arc (not compose a tweet). */
export declare function wantsOpenPurchaseInBrowser(text: string): boolean;
export declare function pickPurchaseLink(links: string[], text: string): string | null;
export declare function isResearchFollowUpMessage(text: string): boolean;
export declare function buildResearchFollowUpPrompt(topic: string, followUp: string, lastReply?: string): string;
//# sourceMappingURL=research-session.d.ts.map