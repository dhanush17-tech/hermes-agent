import { desc } from "drizzle-orm";
import type { AuditEventType, RiskLevel } from "@hermes-os/shared";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { auditLogs } from "../schema.js";

export type AuditLogInput = {
  eventType: AuditEventType;
  actor: string;
  toolName?: string;
  payload?: unknown;
  result?: unknown;
  riskLevel?: RiskLevel;
  approvalId?: string;
  createdAt?: string;
};

export class AuditRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(entry: AuditLogInput): Promise<string> {
    const id = generateId("audit");
    const createdAt = entry.createdAt ?? new Date().toISOString();
    await this.db.insert(auditLogs).values({
      id,
      eventType: entry.eventType,
      actor: entry.actor,
      toolName: entry.toolName ?? null,
      payload: entry.payload !== undefined ? JSON.stringify(entry.payload) : null,
      result: entry.result !== undefined ? JSON.stringify(entry.result) : null,
      riskLevel: entry.riskLevel ?? null,
      approvalId: entry.approvalId ?? null,
      createdAt,
    });
    return id;
  }

  async listByEventType(eventType: AuditEventType): Promise<Array<{ id: string; eventType: string }>> {
    const rows = await this.db.select().from(auditLogs);
    return rows
      .filter((r) => r.eventType === eventType)
      .map((r) => ({ id: r.id, eventType: r.eventType }));
  }

  async listRecent(limit = 50): Promise<typeof auditLogs.$inferSelect[]> {
    return this.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async listFiltered(options?: {
    limit?: number;
    eventTypes?: AuditEventType[];
    sinceIso?: string;
  }): Promise<typeof auditLogs.$inferSelect[]> {
    const limit = options?.limit ?? 100;
    let rows = await this.db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit * 3);

    if (options?.sinceIso) {
      rows = rows.filter((r) => r.createdAt >= options.sinceIso!);
    }
    if (options?.eventTypes?.length) {
      const set = new Set(options.eventTypes);
      rows = rows.filter((r) => set.has(r.eventType as AuditEventType));
    }
    return rows.slice(0, limit);
  }
}
