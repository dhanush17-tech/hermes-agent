import { eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { commitments } from "../schema.js";
import type { CommitmentRecord, CommitmentInput, CommitmentFilters } from "../graph/types.js";

export class CommitmentsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(input: CommitmentInput): Promise<CommitmentRecord> {
    const now = new Date().toISOString();
    const record: CommitmentRecord = {
      id: generateId("cmt"),
      status: "open",
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await this.db.insert(commitments).values({
      id: record.id,
      description: record.description,
      owner: record.owner,
      counterpartyPersonId: record.counterpartyPersonId ?? null,
      relatedProjectId: record.relatedProjectId ?? null,
      dueAt: record.dueAt ?? null,
      status: record.status,
      sourceItemId: record.sourceItemId ?? null,
      evidenceItemId: record.evidenceItemId ?? null,
      confidence: record.confidence ?? 0.7,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    return record;
  }

  async findCommitments(filters: CommitmentFilters = {}, limit = 20): Promise<CommitmentRecord[]> {
    let rows = await this.db.select().from(commitments);
    const status = filters.status ?? "open";
    rows = rows.filter((r) => r.status === status);
    if (filters.owner) rows = rows.filter((r) => r.owner === filters.owner);
    if (filters.counterpartyPersonId) {
      rows = rows.filter((r) => r.counterpartyPersonId === filters.counterpartyPersonId);
    }
    return rows.slice(0, limit).map((r) => this.rowToRecord(r));
  }

  async listOpen(limit = 20): Promise<CommitmentRecord[]> {
    return this.findCommitments({ status: "open" }, limit);
  }

  private rowToRecord(row: typeof commitments.$inferSelect): CommitmentRecord {
    return {
      id: row.id,
      description: row.description,
      owner: row.owner,
      counterpartyPersonId: row.counterpartyPersonId ?? undefined,
      relatedProjectId: row.relatedProjectId ?? undefined,
      dueAt: row.dueAt ?? undefined,
      status: row.status ?? "open",
      sourceItemId: row.sourceItemId ?? undefined,
      evidenceItemId: row.evidenceItemId ?? undefined,
      confidence: row.confidence ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
