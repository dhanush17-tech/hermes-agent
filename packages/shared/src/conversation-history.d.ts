import type { ChatTurn } from "./types.js";
export declare function formatConversationForPrompt(turns: ChatTurn[], maxTurns?: number): string;
export declare function toChatApiHistory(turns: ChatTurn[], maxTurns?: number): Array<{
    role: "user" | "assistant";
    content: string;
}>;
/** Short replies that rely on the prior turn (e.g. "what kind of feedback?"). */
export declare function augmentMessagingFollowUp(message: string, turns: ChatTurn[]): string;
//# sourceMappingURL=conversation-history.d.ts.map