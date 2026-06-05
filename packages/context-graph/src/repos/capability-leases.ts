import { eq } from "drizzle-orm";
import type { CapabilityLease, ApprovalChannel, RiskLevelApproval } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { capabilityLeases } from "../schema.js";

export class CapabilityLeasesRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(lease: CapabilityLease): Promise<void> {
    await this.db.insert(capabilityLeases).values({
      id: lease.id,
      approvalId: lease.approvalId,
      toolName: lease.toolName,
      payloadHash: lease.payloadHash,
      riskLevel: lease.riskLevel,
      approvedBy: lease.approvedBy,
      approvedChannel: lease.approvedChannel,
      allowedDestination: lease.allowedDestination ?? null,
      allowedAccount: lease.allowedAccount ?? null,
      maxUses: lease.maxUses,
      usedCount: lease.usedCount,
      expiresAt: lease.expiresAt,
      createdAt: lease.createdAt,
    });
  }

  async getByApprovalId(approvalId: string): Promise<CapabilityLease | null> {
    const rows = await this.db
      .select()
      .from(capabilityLeases)
      .where(eq(capabilityLeases.approvalId, approvalId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.rowToLease(row);
  }

  async getById(id: string): Promise<CapabilityLease | null> {
    const rows = await this.db
      .select()
      .from(capabilityLeases)
      .where(eq(capabilityLeases.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return this.rowToLease(row);
  }

  async incrementUsedCount(id: string): Promise<void> {
    const lease = await this.getById(id);
    if (!lease) return;
    await this.db
      .update(capabilityLeases)
      .set({ usedCount: lease.usedCount + 1 })
      .where(eq(capabilityLeases.id, id));
  }

  async listActive(nowIso: string): Promise<CapabilityLease[]> {
    const rows = await this.db.select().from(capabilityLeases);
    return rows
      .map((r) => this.rowToLease(r))
      .filter((l) => l.expiresAt > nowIso && l.usedCount < l.maxUses);
  }

  private rowToLease(row: typeof capabilityLeases.$inferSelect): CapabilityLease {
    return {
      id: row.id,
      approvalId: row.approvalId,
      toolName: row.toolName,
      payloadHash: row.payloadHash,
      riskLevel: row.riskLevel as RiskLevelApproval,
      approvedBy: row.approvedBy,
      approvedChannel: row.approvedChannel as ApprovalChannel,
      allowedDestination: row.allowedDestination ?? undefined,
      allowedAccount: row.allowedAccount ?? undefined,
      maxUses: row.maxUses,
      usedCount: row.usedCount,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    };
  }
}
