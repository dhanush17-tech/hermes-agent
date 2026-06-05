import type { NotificationHistoryRepository } from "@hermes-os/context-graph";
import { generateId } from "@hermes-os/shared";
import type { Notification } from "./types.js";

export class NotificationStore {
  constructor(private readonly history: NotificationHistoryRepository) {}

  async recordSent(
    notification: Notification,
    channel: string,
    now = new Date().toISOString(),
  ): Promise<void> {
    await this.history.insert({
      id: notification.id || generateId(),
      notificationType: notification.type,
      title: notification.title,
      body: notification.body,
      priority: notification.priority,
      score: notification.score,
      dedupeKey: notification.dedupeKey,
      status: "sent",
      sentChannel: channel,
      sentAt: now,
    });
  }

  async wasRecentlySent(dedupeKey: string): Promise<boolean> {
    if (!dedupeKey) return false;
    const existing = await this.history.findByDedupeKey(dedupeKey);
    return existing !== null;
  }
}
