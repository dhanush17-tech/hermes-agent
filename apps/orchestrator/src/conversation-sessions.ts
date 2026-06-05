import type { ChatTurn } from "@hermes-os/shared";
import { isMessagingChannel } from "@hermes-os/shared";

const MAX_TURNS = 24;

export class ConversationSessionStore {
  private readonly sessions = new Map<string, ChatTurn[]>();

  sessionKey(channel: string, senderId: string): string {
    return `${channel}:${senderId}`;
  }

  getHistory(channel: string, senderId: string): ChatTurn[] {
    if (!isMessagingChannel(channel)) return [];
    return [...(this.sessions.get(this.sessionKey(channel, senderId)) ?? [])];
  }

  appendTurn(channel: string, senderId: string, user: string, assistant: string): void {
    if (!isMessagingChannel(channel)) return;
    const key = this.sessionKey(channel, senderId);
    const turns = this.sessions.get(key) ?? [];
    turns.push({ role: "user", content: user.trim() });
    turns.push({ role: "assistant", content: assistant.trim() });
    while (turns.length > MAX_TURNS) turns.shift();
    this.sessions.set(key, turns);
  }

  clear(channel: string, senderId: string): void {
    this.sessions.delete(this.sessionKey(channel, senderId));
  }
}
