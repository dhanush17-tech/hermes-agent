import { desc, eq, gte } from "drizzle-orm";
import type { ContextGraphDb } from "../db.js";
import { sourceItems } from "../schema.js";

export type SourceItemRow = {
  id: string;
  sourceType: string;
  externalId: string | null;
  title: string | null;
  content: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
};

export class SourceItemsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async upsert(row: SourceItemRow): Promise<void> {
    if (!row.externalId) {
      await this.db.insert(sourceItems).values({
        id: row.id,
        sourceType: row.sourceType,
        externalId: row.externalId,
        title: row.title,
        content: row.content,
        metadata: row.metadata,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      return;
    }

    const existing = await this.db
      .select()
      .from(sourceItems)
      .where(eq(sourceItems.externalId, row.externalId))
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(sourceItems)
        .set({
          title: row.title,
          content: row.content,
          metadata: row.metadata,
          updatedAt: row.updatedAt,
        })
        .where(eq(sourceItems.id, existing[0].id));
      return;
    }

    await this.db.insert(sourceItems).values({
      id: row.id,
      sourceType: row.sourceType,
      externalId: row.externalId,
      title: row.title,
      content: row.content,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async listSince(isoTime: string, limit = 50): Promise<SourceItemRow[]> {
    const rows = await this.db
      .select()
      .from(sourceItems)
      .where(gte(sourceItems.createdAt, isoTime))
      .orderBy(desc(sourceItems.updatedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      externalId: r.externalId,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async listRecent(limit = 30): Promise<SourceItemRow[]> {
    const rows = await this.db
      .select()
      .from(sourceItems)
      .orderBy(desc(sourceItems.updatedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      sourceType: r.sourceType,
      externalId: r.externalId,
      title: r.title,
      content: r.content,
      metadata: r.metadata,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
