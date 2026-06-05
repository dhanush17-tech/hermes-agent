import type { ChatTurn } from "@hermes-os/shared";
export declare class ConversationSessionStore {
    private readonly sessions;
    sessionKey(channel: string, senderId: string): string;
    getHistory(channel: string, senderId: string): ChatTurn[];
    appendTurn(channel: string, senderId: string, user: string, assistant: string): void;
    clear(channel: string, senderId: string): void;
}
//# sourceMappingURL=conversation-sessions.d.ts.map