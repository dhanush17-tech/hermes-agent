import { desc, eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { risks } from "../schema.js";

export type RiskUpsert = {
  category: string;
  description: string;
  impact: number;
  urgency: number;
  confidence: number;
  score: number;
  relatedProjectId?: string;
  relatedPersonId?: string;
};

export class RisksRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async listActive(limit = 20) {
    return this.db
      .select()
      .from(risks)
      .where(eq(risks.status, "active"))
      .orderBy(desc(risks.score))
      .limit(limit);
  }

  async countActive(): Promise<number> {
    const rows = await this.db.select().from(risks).where(eq(risks.status, "active"));
    return rows.length;
  }

  async upsertDetected(row: RiskUpsert): Promise<string> {
    const now = new Date().toISOString();
    const existing = await this.db
      .select()
      .from(risks)
      .where(eq(risks.description, row.description))
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(risks)
        .set({
          impact: row.impact,
          urgency: row.urgency,
          confidence: row.confidence,
          score: row.score,
          updatedAt: now,
        })
        .where(eq(risks.id, existing[0].id));
      return existing[0].id;
    }

    const id = generateId("risk");
    await this.db.insert(risks).values({
      id,
      category: row.category,
      description: row.description,
      impact: row.impact,
      urgency: row.urgency,
      confidence: row.confidence,
      score: row.score,
      relatedProjectId: row.relatedProjectId,
      relatedPersonId: row.relatedPersonId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async resolveStale(keepDescriptions: Set<string>): Promise<void> {
    const active = await this.listActive(100);
    const now = new Date().toISOString();
    for (const r of active) {
      if (!keepDescriptions.has(r.description)) {
        await this.db.update(risks).set({ status: "resolved", updatedAt: now }).where(eq(risks.id, r.id));
      }
    }
  }
}
