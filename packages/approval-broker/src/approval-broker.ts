import type {
  Approval,
  ApprovalChannel,
  CapabilityLease,
  RiskLevelApproval,
} from "@hermes-os/shared";
import { generateId, hashPayload, isApprovedSender, loadApprovedSendersFromEnv } from "@hermes-os/shared";
import type { ApprovalsRepository, CapabilityLeasesRepository } from "@hermes-os/context-graph";
import type { AuditLogger } from "@hermes-os/audit-log";

const FORBIDDEN_ACTORS = new Set(["assistant", "system", "hermes"]);

export type CreateApprovalInput = {
  actionType: string;
  summary: string;
  exactPayload: unknown;
  riskLevel: RiskLevelApproval;
  destination?: string;
  account?: string;
};

export type ResolveApprovalInput = {
  id: string;
  decision: "approved" | "denied";
  actor: string;
  channel?: ApprovalChannel;
  expectedPayload?: unknown;
  /** Required for critical-risk approvals (approve <id> execute). */
  criticalConfirmed?: boolean;
};

export type ValidateLeaseInput = {
  approvalId: string;
  toolName: string;
  payload: unknown;
  destination?: string;
  account?: string;
};

export type ExpiryWatcherHandle = {
  stop: () => void;
};

export class ApprovalBroker {
  private expiryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly approvedSenders: Set<string>;

  constructor(
    private readonly approvals: ApprovalsRepository,
    private readonly leases: CapabilityLeasesRepository,
    private readonly audit: AuditLogger,
    private readonly ttlSeconds: number,
    private readonly now: () => Date = () => new Date(),
    approvedSenders?: Set<string>,
  ) {
    this.approvedSenders = approvedSenders ?? loadApprovedSendersFromEnv();
  }

  async createApproval(input: CreateApprovalInput): Promise<Approval> {
    const id = generateId();
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + this.ttlSeconds * 1000).toISOString();
    const payloadHash = hashPayload(input.exactPayload);

    const approval: Approval = {
      id,
      actionType: input.actionType,
      summary: input.summary,
      exactPayload: input.exactPayload,
      payloadHash,
      riskLevel: input.riskLevel,
      status: "pending",
      createdAt,
      expiresAt,
    };

    await this.approvals.insert(approval);
    await this.audit.log({
      eventType: "approval_requested",
      actor: "system",
      toolName: input.actionType,
      payload: {
        id,
        summary: input.summary,
        payloadHash,
        destination: input.destination,
        account: input.account,
      },
      riskLevel: input.riskLevel === "critical" || input.riskLevel === "high" ? "high" : "medium",
      approvalId: id,
    });

    return approval;
  }

  async resolveApproval(input: ResolveApprovalInput): Promise<Approval> {
    if (FORBIDDEN_ACTORS.has(input.actor.toLowerCase())) {
      throw new Error("Assistant cannot approve its own actions");
    }

    if (input.channel === "imessage" && this.approvedSenders.size > 0) {
      if (!isApprovedSender(input.actor, this.approvedSenders)) {
        throw new Error("Sender not authorized to approve actions");
      }
    }

    await this.expireStalePending();

    const approval = await this.approvals.getById(input.id);
    if (!approval) {
      throw new Error(`Approval not found: ${input.id}`);
    }

    if (approval.status !== "pending") {
      throw new Error(`Approval ${input.id} is not pending (${approval.status})`);
    }

    if (this.isExpired(approval)) {
      await this.approvals.updateStatus(input.id, "expired", this.now().toISOString());
      throw new Error(`Approval ${input.id} has expired`);
    }

    if (input.expectedPayload !== undefined) {
      const hash = hashPayload(input.expectedPayload);
      if (hash !== approval.payloadHash) {
        throw new Error("Payload hash mismatch — approval invalid for changed payload");
      }
    }

    if (input.decision === "approved" && approval.riskLevel === "critical" && !input.criticalConfirmed) {
      throw new Error(
        `Critical action requires stronger approval — reply: approve ${input.id} execute`,
      );
    }

    const resolvedAt = this.now().toISOString();
    const status = input.decision === "approved" ? "approved" : "denied";
    await this.approvals.updateStatus(input.id, status, resolvedAt);

    await this.audit.log({
      eventType: input.decision === "approved" ? "approval_approved" : "approval_denied",
      actor: input.actor,
      toolName: approval.actionType,
      approvalId: approval.id,
      payload: { id: approval.id, channel: input.channel },
    });

    if (input.decision === "approved") {
      await this.createLeaseFromApproval(approval, input.actor, input.channel ?? "cli");
    }

    return { ...approval, status, resolvedAt };
  }

  async getPendingApprovals(): Promise<Approval[]> {
    await this.expireStalePending();
    return this.approvals.listPending();
  }

  async getApproval(id: string): Promise<Approval | null> {
    await this.expireStalePending();
    return this.approvals.getById(id);
  }

  /** @deprecated Use validateLeaseForExecution instead. */
  async verifyApprovedForExecution(
    approvalId: string,
    payload: unknown,
  ): Promise<Approval> {
    const approval = await this.approvals.getById(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    await this.validateLeaseForExecution({
      approvalId,
      toolName: approval.actionType,
      payload,
    });
    return approval;
  }

  async validateLeaseForExecution(input: ValidateLeaseInput): Promise<CapabilityLease> {
    const approval = await this.approvals.getById(input.approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${input.approvalId}`);
    }
    if (approval.status !== "approved") {
      throw new Error(`Approval ${input.approvalId} is not approved`);
    }
    if (this.isExpired(approval)) {
      throw new Error(`Approval ${input.approvalId} has expired`);
    }

    const lease = await this.leases.getByApprovalId(input.approvalId);
    if (!lease) {
      throw new Error(`No capability lease for approval ${input.approvalId}`);
    }

    if (new Date(lease.expiresAt).getTime() <= this.now().getTime()) {
      throw new Error(`Capability lease for ${input.approvalId} has expired`);
    }

    if (lease.toolName !== input.toolName) {
      throw new Error(`Lease tool mismatch: expected ${lease.toolName}, got ${input.toolName}`);
    }

    const hash = hashPayload(input.payload);
    if (hash !== lease.payloadHash) {
      throw new Error("Payload hash mismatch — cannot execute");
    }

    if (lease.usedCount >= lease.maxUses) {
      throw new Error(`Capability lease for ${input.approvalId} has been fully consumed`);
    }

    if (lease.allowedDestination && input.destination && lease.allowedDestination !== input.destination) {
      throw new Error("Destination not covered by capability lease");
    }

    if (lease.allowedAccount && input.account && lease.allowedAccount !== input.account) {
      throw new Error("Account not covered by capability lease");
    }

    return lease;
  }

  async consumeLease(approvalId: string): Promise<void> {
    const lease = await this.leases.getByApprovalId(approvalId);
    if (!lease) return;
    await this.leases.incrementUsedCount(lease.id);
    await this.audit.log({
      eventType: "capability_lease_consumed",
      actor: "system",
      toolName: lease.toolName,
      approvalId,
      payload: { leaseId: lease.id, usedCount: lease.usedCount + 1, maxUses: lease.maxUses },
    });
  }

  async getLeaseForApproval(approvalId: string): Promise<CapabilityLease | null> {
    return this.leases.getByApprovalId(approvalId);
  }

  startExpiryWatcher(intervalMs = 30_000): ExpiryWatcherHandle {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
    void this.expireStalePending();
    this.expiryTimer = setInterval(() => {
      void this.expireStalePending();
    }, intervalMs);

    return {
      stop: () => {
        if (this.expiryTimer) {
          clearInterval(this.expiryTimer);
          this.expiryTimer = null;
        }
      },
    };
  }

  formatApprovalMessage(approval: Approval): string {
    const payloadPreview =
      typeof approval.exactPayload === "object" && approval.exactPayload !== null
        ? JSON.stringify(approval.exactPayload, null, 2)
        : String(approval.exactPayload);

    const lines = [
      "Approval required.",
      "",
      `Action: ${approval.summary}`,
      `Tool: ${approval.actionType}`,
      `Risk: ${approval.riskLevel}`,
      "",
      "Exact payload:",
      payloadPreview.slice(0, 800),
      "",
      `Approval ID: ${approval.id}`,
      `Expires: ${Math.round(this.ttlSeconds / 60)} minutes`,
      "",
      "Reply:",
    ];

    if (approval.riskLevel === "critical") {
      lines.push(`approve ${approval.id} execute`);
    } else {
      lines.push(`approve ${approval.id}`);
    }
    lines.push(`deny ${approval.id}`);
    lines.push(`edit ${approval.id}: <your changes>`);

    return lines.join("\n");
  }

  private async createLeaseFromApproval(
    approval: Approval,
    approvedBy: string,
    channel: ApprovalChannel,
  ): Promise<CapabilityLease> {
    const lease: CapabilityLease = {
      id: generateId(),
      approvalId: approval.id,
      toolName: approval.actionType,
      payloadHash: approval.payloadHash,
      riskLevel: approval.riskLevel,
      approvedBy,
      approvedChannel: channel,
      maxUses: 1,
      usedCount: 0,
      expiresAt: approval.expiresAt,
      createdAt: this.now().toISOString(),
    };

    await this.leases.insert(lease);
    await this.audit.log({
      eventType: "capability_lease_created",
      actor: approvedBy,
      toolName: approval.actionType,
      approvalId: approval.id,
      payload: { leaseId: lease.id, maxUses: lease.maxUses },
    });

    return lease;
  }

  private isExpired(approval: Approval): boolean {
    return new Date(approval.expiresAt).getTime() <= this.now().getTime();
  }

  private async expireStalePending(): Promise<void> {
    const pending = await this.approvals.listPending();
    for (const approval of pending) {
      if (this.isExpired(approval)) {
        await this.approvals.updateStatus(approval.id, "expired", this.now().toISOString());
      }
    }
  }
}
