import type { Notification } from "../types.js";

export type NotificationChannel = {
  name: string;
  send(notification: Notification): Promise<boolean>;
};

export class ConsoleNotificationChannel implements NotificationChannel {
  readonly name = "console";

  async send(notification: Notification): Promise<boolean> {
    console.log(`[${notification.priority.toUpperCase()}] ${notification.title}\n${notification.body}`);
    return true;
  }
}
