import { isMessagingChannel } from "@hermes-os/shared";
const MAX_TURNS = 24;
export class ConversationSessionStore {
    sessions = new Map();
    sessionKey(channel, senderId) {
        return `${channel}:${senderId}`;
    }
    getHistory(channel, senderId) {
        if (!isMessagingChannel(channel))
            return [];
        return [...(this.sessions.get(this.sessionKey(channel, senderId)) ?? [])];
    }
    appendTurn(channel, senderId, user, assistant) {
        if (!isMessagingChannel(channel))
            return;
        const key = this.sessionKey(channel, senderId);
        const turns = this.sessions.get(key) ?? [];
        turns.push({ role: "user", content: user.trim() });
        turns.push({ role: "assistant", content: assistant.trim() });
        while (turns.length > MAX_TURNS)
            turns.shift();
        this.sessions.set(key, turns);
    }
    clear(channel, senderId) {
        this.sessions.delete(this.sessionKey(channel, senderId));
    }
}
//# sourceMappingURL=conversation-sessions.js.map