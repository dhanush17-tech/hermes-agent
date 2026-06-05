import { eq } from "drizzle-orm";
import type { ContextGraphDb } from "../db.js";
import { notificationHistory } from "../schema.js";

export type NotificationHistoryRecord = {
  id: string;
  notificationType: string;
  title: string;
  body: string;
  priority?: string;
  score?: number;
  dedupeKey?: string;
  status?: string;
  sentChannel?: string;
  sentAt?: string;
  userResponse?: string;
  resolvedAt?: string;
};

export class NotificationHistoryRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(record: NotificationHistoryRecord): Promise<void> {
    await this.db.insert(notificationHistory).values({
      id: record.id,
      notificationType: record.notificationType,
      title: record.title,
      body: record.body,
      priority: record.priority ?? null,
      score: record.score ?? null,
      dedupeKey: record.dedupeKey ?? null,
      status: record.status ?? "sent",
      sentChannel: record.sentChannel ?? null,
      sentAt: record.sentAt ?? null,
      userResponse: record.userResponse ?? null,
      resolvedAt: record.resolvedAt ?? null,
    });
  }

  async findByDedupeKey(dedupeKey: string): Promise<NotificationHistoryRecord | null> {
    const rows = await this.db
      .select()
      .from(notificationHistory)
      .where(eq(notificationHistory.dedupeKey, dedupeKey))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.rowToRecord(row);
  }

  private rowToRecord(row: typeof notificationHistory.$inferSelect): NotificationHistoryRecord {
    return {
      id: row.id,
      notificationType: row.notificationType,
      title: row.title,
      body: row.body,
      priority: row.priority ?? undefined,
      score: row.score ?? undefined,
      dedupeKey: row.dedupeKey ?? undefined,
      status: row.status ?? undefined,
      sentChannel: row.sentChannel ?? undefined,
      sentAt: row.sentAt ?? undefined,
      userResponse: row.userResponse ?? undefined,
      resolvedAt: row.resolvedAt ?? undefined,
    };
  }
}
