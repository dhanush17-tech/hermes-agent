import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDb,
  runMigrations,
  ApprovalsRepository,
  CapabilityLeasesRepository,
  AuditRepository,
} from "@hermes-os/context-graph";
import { AuditLogger } from "@hermes-os/audit-log";
import { ApprovalBroker } from "./approval-broker.js";

describe("ApprovalBroker", () => {
  let dir: string;
  let broker: ApprovalBroker;
  let approvalsRepo: ApprovalsRepository;
  let leasesRepo: CapabilityLeasesRepository;
  let auditLogger: AuditLogger;
  const fixedNow = () => new Date("2025-06-01T12:00:00Z");

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-os-test-"));
    const dbPath = join(dir, "test.sqlite");
    const { db, sqlite } = createDb(dbPath);
    runMigrations(sqlite);
    approvalsRepo = new ApprovalsRepository(db);
    leasesRepo = new CapabilityLeasesRepository(db);
    auditLogger = new AuditLogger(new AuditRepository(db));
    broker = new ApprovalBroker(approvalsRepo, leasesRepo, auditLogger, 300, fixedNow);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates approval with payload hash", async () => {
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post to X",
      exactPayload: { text: "hello", platform: "x" },
      riskLevel: "high",
    });
    expect(approval.status).toBe("pending");
    expect(approval.payloadHash).toHaveLength(64);
    expect(approval.expiresAt).toBe("2025-06-01T12:05:00.000Z");
  });

  it("rejects self-approval by assistant", async () => {
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: { text: "x" },
      riskLevel: "high",
    });
    await expect(
      broker.resolveApproval({
        id: approval.id,
        decision: "approved",
        actor: "assistant",
      }),
    ).rejects.toThrow(/cannot approve/);
  });

  it("expires after TTL", async () => {
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: { text: "x" },
      riskLevel: "high",
    });
    const lateBroker = new ApprovalBroker(
      approvalsRepo,
      leasesRepo,
      auditLogger,
      300,
      () => new Date("2025-06-01T12:06:00Z"),
    );
    await expect(
      lateBroker.resolveApproval({
        id: approval.id,
        decision: "approved",
        actor: "user",
      }),
    ).rejects.toThrow(/expired/);
  });

  it("creates capability lease on approval", async () => {
    const payload = { text: "hello", platform: "x" };
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post to X",
      exactPayload: payload,
      riskLevel: "high",
    });

    await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
      channel: "web",
      expectedPayload: payload,
    });

    const lease = await broker.getLeaseForApproval(approval.id);
    expect(lease).not.toBeNull();
    expect(lease!.toolName).toBe("social.post");
    expect(lease!.payloadHash).toBe(approval.payloadHash);
    expect(lease!.approvedBy).toBe("user");
    expect(lease!.approvedChannel).toBe("web");
    expect(lease!.usedCount).toBe(0);
    expect(lease!.maxUses).toBe(1);
  });

  it("validates lease for matching payload", async () => {
    const payload = { text: "hello", platform: "x" };
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: payload,
      riskLevel: "high",
    });
    await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
    });

    const lease = await broker.validateLeaseForExecution({
      approvalId: approval.id,
      toolName: "social.post",
      payload,
    });
    expect(lease.approvalId).toBe(approval.id);
  });

  it("rejects changed payload", async () => {
    const payload = { text: "hello", platform: "x" };
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: payload,
      riskLevel: "high",
    });
    await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
    });

    await expect(
      broker.validateLeaseForExecution({
        approvalId: approval.id,
        toolName: "social.post",
        payload: { text: "hacked", platform: "x" },
      }),
    ).rejects.toThrow(/hash mismatch/);
  });

  it("rejects reused lease after consumption", async () => {
    const payload = { text: "hello", platform: "x" };
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: payload,
      riskLevel: "high",
    });
    await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
    });

    await broker.validateLeaseForExecution({
      approvalId: approval.id,
      toolName: "social.post",
      payload,
    });
    await broker.consumeLease(approval.id);

    await expect(
      broker.validateLeaseForExecution({
        approvalId: approval.id,
        toolName: "social.post",
        payload,
      }),
    ).rejects.toThrow(/fully consumed/);
  });

  it("rejects expired lease", async () => {
    const payload = { text: "hello", platform: "x" };
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: payload,
      riskLevel: "high",
    });
    await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
    });

    const lateBroker = new ApprovalBroker(
      approvalsRepo,
      leasesRepo,
      auditLogger,
      300,
      () => new Date("2025-06-01T12:06:00Z"),
    );

    await expect(
      lateBroker.validateLeaseForExecution({
        approvalId: approval.id,
        toolName: "social.post",
        payload,
      }),
    ).rejects.toThrow(/expired/);
  });

  it("requires critical confirmation for critical actions", async () => {
    const approval = await broker.createApproval({
      actionType: "filesystem.delete_folder",
      summary: "Delete folder",
      exactPayload: { path: "/tmp/test" },
      riskLevel: "critical",
    });

    await expect(
      broker.resolveApproval({
        id: approval.id,
        decision: "approved",
        actor: "user",
      }),
    ).rejects.toThrow(/stronger approval/);

    const resolved = await broker.resolveApproval({
      id: approval.id,
      decision: "approved",
      actor: "user",
      criticalConfirmed: true,
    });
    expect(resolved.status).toBe("approved");
  });

  it("rejects execution without lease", async () => {
    const approval = await broker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: { text: "x" },
      riskLevel: "high",
    });

    await expect(
      broker.validateLeaseForExecution({
        approvalId: approval.id,
        toolName: "social.post",
        payload: { text: "x" },
      }),
    ).rejects.toThrow(/not approved/);
  });

  it("rejects unapproved iMessage sender", async () => {
    const approvedSenders = new Set(["+15551234567"]);
    const restrictedBroker = new ApprovalBroker(
      approvalsRepo,
      leasesRepo,
      auditLogger,
      300,
      fixedNow,
      approvedSenders,
    );
    const approval = await restrictedBroker.createApproval({
      actionType: "social.post",
      summary: "Post",
      exactPayload: { text: "x" },
      riskLevel: "high",
    });

    await expect(
      restrictedBroker.resolveApproval({
        id: approval.id,
        decision: "approved",
        actor: "+19998887777",
        channel: "imessage",
      }),
    ).rejects.toThrow(/not authorized/);
  });
});
