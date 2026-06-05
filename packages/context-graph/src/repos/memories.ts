import { desc, eq, like } from "drizzle-orm";
import type { ContextGraphDb } from "../db.js";
import { memories } from "../schema.js";

export type MemoryRow = {
  id: string;
  memoryType: string;
  content: string;
  source: string | null;
  sourceId: string | null;
  confidence: number | null;
  scope: string | null;
  expiry: string | null;
  evidence: string | null;
  createdAt: string;
  updatedAt: string;
};

export class MemoriesRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(row: MemoryRow): Promise<void> {
    await this.db.insert(memories).values({
      id: row.id,
      memoryType: row.memoryType,
      content: row.content,
      source: row.source,
      sourceId: row.sourceId,
      confidence: row.confidence,
      scope: row.scope,
      expiry: row.expiry,
      evidence: row.evidence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.db.delete(memories).where(eq(memories.id, id));
    return true;
  }

  async search(query: string, limit = 10): Promise<MemoryRow[]> {
    const pattern = `%${query.replace(/%/g, "")}%`;
    const rows = await this.db
      .select()
      .from(memories)
      .where(like(memories.content, pattern))
      .orderBy(desc(memories.updatedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      memoryType: r.memoryType,
      content: r.content,
      source: r.source,
      sourceId: r.sourceId,
      confidence: r.confidence,
      scope: r.scope,
      expiry: r.expiry,
      evidence: r.evidence,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async listRecent(limit = 20): Promise<MemoryRow[]> {
    const rows = await this.db
      .select()
      .from(memories)
      .orderBy(desc(memories.updatedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      memoryType: r.memoryType,
      content: r.content,
      source: r.source,
      sourceId: r.sourceId,
      confidence: r.confidence,
      scope: r.scope,
      expiry: r.expiry,
      evidence: r.evidence,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async count(): Promise<number> {
    const rows = await this.db.select().from(memories);
    return rows.length;
  }
}
