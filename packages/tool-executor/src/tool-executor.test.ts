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
import { ApprovalBroker } from "@hermes-os/approval-broker";
import { PolicyEngine } from "@hermes-os/policies";
import { loadRiskPolicy } from "@hermes-os/policies";
import { resolve } from "node:path";
import { ToolExecutor } from "./tool-executor.js";
import { createDefaultMockTools } from "./registry.js";

const root = resolve(import.meta.dirname, "../../..");

describe("ToolExecutor", () => {
  let dir: string;
  let executor: ToolExecutor;
  let broker: ApprovalBroker;
  let approvalsRepo: ApprovalsRepository;

  beforeEach(() => {
    process.env.HERMES_OS_ROOT = root;
    dir = mkdtempSync(join(tmpdir(), "hermes-exec-"));
    const { db, sqlite } = createDb(join(dir, "test.sqlite"));
    runMigrations(sqlite);
    approvalsRepo = new ApprovalsRepository(db);
    const leasesRepo = new CapabilityLeasesRepository(db);
    const audit = new AuditLogger(new AuditRepository(db));
    broker = new ApprovalBroker(approvalsRepo, leasesRepo, audit, 300);
    const policy = new PolicyEngine(loadRiskPolicy());
    executor = new ToolExecutor(policy, broker, audit, createDefaultMockTools());
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not execute social.post without approval", async () => {
    const result = await executor.invoke(
      "social.post",
      { text: "launch", platform: "x" },
      { actor: "user", workspaceRoot: root },
      { summary: "Post to X" },
    );
    expect(result.status).toBe("pending_approval");
    if (result.status === "pending_approval") {
      const pending = await approvalsRepo.listPending();
      expect(pending).toHaveLength(1);
      const executed = await executor.invoke(
        "social.post",
        { text: "hacked" },
        { actor: "user", workspaceRoot: root, approvalId: result.approvalId },
      );
      expect(executed.status).toBe("denied");
    }
  });

  it("executes after approval with exact payload and valid lease", async () => {
    const payload = { text: "launch", platform: "x" };
    const pending = await executor.invoke(
      "social.post",
      payload,
      { actor: "user", workspaceRoot: root },
    );
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") return;

    await broker.resolveApproval({
      id: pending.approvalId,
      decision: "approved",
      actor: "user",
      expectedPayload: payload,
    });

    const result = await executor.invoke("social.post", payload, {
      actor: "user",
      workspaceRoot: root,
      approvalId: pending.approvalId,
    });
    expect(result.status).toBe("success");
  });

  it("rejects second execution after lease consumed", async () => {
    const payload = { text: "launch", platform: "x" };
    const pending = await executor.invoke(
      "social.post",
      payload,
      { actor: "user", workspaceRoot: root },
    );
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") return;

    await broker.resolveApproval({
      id: pending.approvalId,
      decision: "approved",
      actor: "user",
      expectedPayload: payload,
    });

    const first = await executor.invoke("social.post", payload, {
      actor: "user",
      workspaceRoot: root,
      approvalId: pending.approvalId,
    });
    expect(first.status).toBe("success");

    const second = await executor.invoke("social.post", payload, {
      actor: "user",
      workspaceRoot: root,
      approvalId: pending.approvalId,
    });
    expect(second.status).toBe("denied");
    if (second.status === "denied") {
      expect(second.reason).toMatch(/consumed|hash mismatch/);
    }
  });

  it("denies high-risk execution without valid lease", async () => {
    const payload = { text: "launch", platform: "x" };
    const pending = await executor.invoke(
      "social.post",
      payload,
      { actor: "user", workspaceRoot: root },
    );
    expect(pending.status).toBe("pending_approval");
    if (pending.status !== "pending_approval") return;

    const result = await executor.invoke("social.post", payload, {
      actor: "user",
      workspaceRoot: root,
      approvalId: pending.approvalId,
    });
    expect(result.status).toBe("denied");
  });
});
