import { eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { evidenceItems } from "../schema.js";

export type EvidenceRecord = {
  id: string;
  sourceItemId: string;
  excerpt: string;
  claim?: string;
  confidence?: number;
  createdAt: string;
};

export class EvidenceRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(input: Omit<EvidenceRecord, "id" | "createdAt">): Promise<EvidenceRecord> {
    const record: EvidenceRecord = {
      id: generateId("ev"),
      createdAt: new Date().toISOString(),
      ...input,
    };
    await this.db.insert(evidenceItems).values({
      id: record.id,
      sourceItemId: record.sourceItemId,
      excerpt: record.excerpt,
      claim: record.claim ?? null,
      confidence: record.confidence ?? 0.7,
      createdAt: record.createdAt,
    });
    return record;
  }

  async listBySourceItem(sourceItemId: string): Promise<EvidenceRecord[]> {
    const rows = await this.db
      .select()
      .from(evidenceItems)
      .where(eq(evidenceItems.sourceItemId, sourceItemId));
    return rows.map((r) => ({
      id: r.id,
      sourceItemId: r.sourceItemId,
      excerpt: r.excerpt,
      claim: r.claim ?? undefined,
      confidence: r.confidence ?? undefined,
      createdAt: r.createdAt,
    }));
  }
}
