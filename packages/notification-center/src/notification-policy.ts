import type { Notification, NotificationPriority } from "./types.js";

export type NotificationPolicyConfig = {
  quietHoursStart?: number;
  quietHoursEnd?: number;
  immediateScoreMin?: number;
  digestScoreMin?: number;
  maxIgnoredBeforeSuppress?: number;
};

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export class NotificationPolicy {
  constructor(private readonly config: NotificationPolicyConfig = {}) {}

  score(notification: Notification): number {
    const base = notification.score;
    const priorityBoost = PRIORITY_ORDER[notification.priority] * 5;
    return Math.min(100, base + priorityBoost);
  }

  shouldSendImmediately(notification: Notification, now = new Date()): boolean {
    if (this.isQuietHours(now)) {
      return notification.priority === "urgent";
    }
    const min = this.config.immediateScoreMin ?? 70;
    return this.score(notification) >= min;
  }

  shouldIncludeInDigest(notification: Notification): boolean {
    const min = this.config.digestScoreMin ?? 40;
    return this.score(notification) >= min;
  }

  isQuietHours(now: Date): boolean {
    const start = this.config.quietHoursStart;
    const end = this.config.quietHoursEnd;
    if (start === undefined || end === undefined) return false;
    const hour = now.getHours();
    if (start <= end) {
      return hour >= start && hour < end;
    }
    return hour >= start || hour < end;
  }
}
