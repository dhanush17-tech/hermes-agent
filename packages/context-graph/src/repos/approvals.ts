import { eq } from "drizzle-orm";
import type { Approval, ApprovalStatus } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { approvals } from "../schema.js";

export class ApprovalsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(approval: Approval): Promise<void> {
    await this.db.insert(approvals).values({
      id: approval.id,
      actionType: approval.actionType,
      summary: approval.summary,
      exactPayload: JSON.stringify(approval.exactPayload),
      payloadHash: approval.payloadHash,
      riskLevel: approval.riskLevel,
      status: approval.status,
      createdAt: approval.createdAt,
      expiresAt: approval.expiresAt,
      resolvedAt: approval.resolvedAt ?? null,
    });
  }

  async getById(id: string): Promise<Approval | null> {
    const rows = await this.db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.rowToApproval(row);
  }

  async listPending(): Promise<Approval[]> {
    const rows = await this.db
      .select()
      .from(approvals)
      .where(eq(approvals.status, "pending"));
    return rows.map((r) => this.rowToApproval(r));
  }

  async updateStatus(
    id: string,
    status: ApprovalStatus,
    resolvedAt?: string,
  ): Promise<void> {
    await this.db
      .update(approvals)
      .set({ status, resolvedAt: resolvedAt ?? null })
      .where(eq(approvals.id, id));
  }

  private rowToApproval(row: typeof approvals.$inferSelect): Approval {
    return {
      id: row.id,
      actionType: row.actionType,
      summary: row.summary,
      exactPayload: JSON.parse(row.exactPayload) as unknown,
      payloadHash: row.payloadHash,
      riskLevel: row.riskLevel as Approval["riskLevel"],
      status: row.status as Approval["status"],
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      resolvedAt: row.resolvedAt ?? undefined,
    };
  }
}
