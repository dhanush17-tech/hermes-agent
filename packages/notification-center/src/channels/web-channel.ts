import type { Notification } from "../types.js";
import type { NotificationChannel } from "./console-channel.js";

export class WebNotificationChannel implements NotificationChannel {
  readonly name = "web";
  private readonly listeners = new Set<(n: Notification) => void>();

  subscribe(listener: (n: Notification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async send(notification: Notification): Promise<boolean> {
    for (const listener of this.listeners) {
      listener(notification);
    }
    return this.listeners.size > 0;
  }
}
