import { desc, eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { openLoops } from "../schema.js";
import type { OpenLoop, OpenLoopFilters } from "../graph/types.js";

export class OpenLoopsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async listOpen(limit = 20): Promise<OpenLoop[]> {
    const rows = await this.db
      .select()
      .from(openLoops)
      .where(eq(openLoops.status, "open"))
      .orderBy(desc(openLoops.importanceScore))
      .limit(limit);
    return rows.map((r) => this.rowToLoop(r));
  }

  async findOpenLoops(filters: OpenLoopFilters = {}, limit = 30): Promise<OpenLoop[]> {
    let rows = await this.db.select().from(openLoops);
    if (filters.status) {
      rows = rows.filter((r) => r.status === filters.status);
    } else {
      rows = rows.filter((r) => r.status === "open");
    }
    if (filters.owner) {
      rows = rows.filter((r) => r.owner === filters.owner);
    }
    if (filters.relatedPersonId) {
      rows = rows.filter((r) => r.relatedPersonId === filters.relatedPersonId);
    }
    if (filters.minImportance !== undefined) {
      rows = rows.filter((r) => (r.importanceScore ?? 0) >= filters.minImportance!);
    }
    return rows
      .sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0))
      .slice(0, limit)
      .map((r) => this.rowToLoop(r));
  }

  async countOpen(): Promise<number> {
    const rows = await this.db.select().from(openLoops).where(eq(openLoops.status, "open"));
    return rows.length;
  }

  async createFromMessage(description: string, source = "user"): Promise<string> {
    return this.createLoop({ description, source, owner: "user" });
  }

  async createLoop(input: {
    description: string;
    source: string;
    sourceId?: string;
    owner?: string;
    relatedPersonId?: string;
    relatedProjectId?: string;
    importanceScore?: number;
  }): Promise<string> {
    const existing = await this.db.select().from(openLoops);
    const dup = existing.find(
      (l) => l.description === input.description && l.status === "open",
    );
    if (dup) return dup.id;

    const now = new Date().toISOString();
    const id = generateId("loop");
    await this.db.insert(openLoops).values({
      id,
      source: input.source,
      sourceId: input.sourceId ?? null,
      description: input.description,
      owner: input.owner ?? "user",
      relatedPersonId: input.relatedPersonId ?? null,
      relatedProjectId: input.relatedProjectId ?? null,
      status: "open",
      importanceScore: input.importanceScore ?? 0.6,
      confidence: 0.75,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  private rowToLoop(row: typeof openLoops.$inferSelect): OpenLoop {
    return {
      id: row.id,
      source: row.source,
      sourceId: row.sourceId ?? undefined,
      description: row.description,
      owner: row.owner ?? undefined,
      relatedPersonId: row.relatedPersonId ?? undefined,
      relatedProjectId: row.relatedProjectId ?? undefined,
      dueDate: row.dueDate ?? undefined,
      importanceScore: row.importanceScore ?? undefined,
      confidence: row.confidence ?? undefined,
      status: row.status ?? "open",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
