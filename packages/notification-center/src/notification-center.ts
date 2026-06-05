import { generateId } from "@hermes-os/shared";
import type { NotificationHistoryRepository } from "@hermes-os/context-graph";
import type { Notification, DispatchResult } from "./types.js";
import type { NotificationChannel } from "./channels/console-channel.js";
import { ConsoleNotificationChannel } from "./channels/console-channel.js";
import { NotificationPolicy } from "./notification-policy.js";
import { NotificationStore } from "./notification-store.js";

export type NotificationCenterHandle = {
  stop: () => void;
};

export class NotificationCenter {
  private readonly channels: NotificationChannel[] = [];
  private readonly policy: NotificationPolicy;
  private readonly store: NotificationStore;
  private running = false;

  constructor(
    historyRepo: NotificationHistoryRepository,
    policy?: NotificationPolicy,
    channels?: NotificationChannel[],
  ) {
    this.policy = policy ?? new NotificationPolicy();
    this.store = new NotificationStore(historyRepo);
    this.channels = channels ?? [new ConsoleNotificationChannel()];
  }

  addChannel(channel: NotificationChannel): void {
    this.channels.push(channel);
  }

  start(): NotificationCenterHandle {
    this.running = true;
    return {
      stop: () => {
        this.running = false;
      },
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  async dispatch(notification: Omit<Notification, "id" | "createdAt">): Promise<DispatchResult> {
    const full: Notification = {
      ...notification,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    if (full.dedupeKey && (await this.store.wasRecentlySent(full.dedupeKey))) {
      return { sent: false, channel: "none", reason: "dedupe" };
    }

    if (!this.policy.shouldSendImmediately(full)) {
      return { sent: false, channel: "none", reason: "below_threshold" };
    }

    for (const channel of this.channels) {
      const ok = await channel.send(full);
      if (ok) {
        await this.store.recordSent(full, channel.name);
        return { sent: true, channel: channel.name };
      }
    }

    return { sent: false, channel: "none", reason: "no_channel" };
  }
}
