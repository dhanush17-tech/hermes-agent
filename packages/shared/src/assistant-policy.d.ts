/**
 * Global behavior: Hermes acts via tools — avoid LLM refusals when action is possible.
 */
export declare const HERMES_ASSISTANT_POLICY: string;
/** Short iMessage / chat voice — same channel, same rules. */
export declare const HERMES_MESSAGING_PERSONA: string;
/** @deprecated use isMessagingChannel */
export declare const HERMES_CHAT_PERSONA: string;
export declare function isMessagingChannel(channel?: string): boolean;
export declare function withAssistantPolicy(system?: string): string;
export declare function withMessagingPersona(system?: string, channel?: string): string;
/** @deprecated use withMessagingPersona */
export declare function withChatPersona(system?: string, channel?: string): string;
/** Only when the user clearly wants X/Twitter — not generic "post" in other contexts. */
export declare function wantsExplicitTweet(text: string): boolean;
export declare function wantsShoppingOrLinks(text: string): boolean;
/** Gmail, social, inbox — always browser + autonomous loop, never API-only chat. */
export declare function needsBrowserAutonomy(text: string): boolean;
export declare function needsAgentPlanner(text: string): boolean;
export declare function isRefusalResponse(text: string): boolean;
/** Pull https links from prior assistant text for link follow-ups. */
export declare function extractHttpsLinks(text: string, max?: number): string[];
export declare function formatLinksFallback(links: string[], preamble?: string): string;
//# sourceMappingURL=assistant-policy.d.ts.map