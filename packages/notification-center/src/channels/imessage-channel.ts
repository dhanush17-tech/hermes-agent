import type { Notification } from "../types.js";
import type { NotificationChannel } from "./console-channel.js";

export type IMessageSendFn = (text: string, recipient: string) => Promise<void>;

export class IMessageNotificationChannel implements NotificationChannel {
  readonly name = "imessage";

  constructor(
    private readonly sendFn: IMessageSendFn,
    private readonly defaultRecipient?: string,
  ) {}

  async send(notification: Notification): Promise<boolean> {
    const recipient = this.defaultRecipient ?? process.env.IMESSAGE_DEFAULT_RECIPIENT;
    if (!recipient) return false;
    const text = `[Hermes] ${notification.title}\n${notification.body.slice(0, 500)}`;
    await this.sendFn(text, recipient);
    return true;
  }
}
