import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createDb,
  runMigrations,
  CapabilityLeasesRepository,
  NotificationHistoryRepository,
  EvidenceRepository,
  CommitmentsRepository,
  SourceItemsRepository,
} from "@hermes-os/context-graph";

describe("context-graph migrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-cg-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates all phase-2 tables and repos work", async () => {
    const dbPath = join(dir, "test.sqlite");
    const { db, sqlite } = createDb(dbPath);
    runMigrations(sqlite);

    const leasesRepo = new CapabilityLeasesRepository(db);
    await leasesRepo.insert({
      id: "lease_1",
      approvalId: "ap_1",
      toolName: "social.post",
      payloadHash: "abc123",
      riskLevel: "high",
      approvedBy: "user",
      approvedChannel: "web",
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    expect(await leasesRepo.getByApprovalId("ap_1")).not.toBeNull();

    const notifRepo = new NotificationHistoryRepository(db);
    await notifRepo.insert({
      id: "n_1",
      notificationType: "risk",
      title: "Test",
      body: "Body",
      dedupeKey: "risk:test",
    });
    expect(await notifRepo.findByDedupeKey("risk:test")).not.toBeNull();

    const sourceItems = new SourceItemsRepository(db);
    const now = new Date().toISOString();
    await sourceItems.upsert({
      id: "src_1",
      sourceType: "gmail",
      externalId: "gmail:test1",
      title: "Test email",
      content: "Body",
      metadata: null,
      createdAt: now,
      updatedAt: now,
    });

    const evidenceRepo = new EvidenceRepository(db);
    const ev = await evidenceRepo.insert({
      sourceItemId: "src_1",
      excerpt: "Lisa asked for final details",
      claim: "Venue logistics unresolved",
      confidence: 0.8,
    });
    expect(ev.id).toBeTruthy();
    expect(await evidenceRepo.listBySourceItem("src_1")).toHaveLength(1);

    const commitmentsRepo = new CommitmentsRepository(db);
    const cmt = await commitmentsRepo.insert({
      description: "Reply to Lisa about venue",
      owner: "user",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(cmt.status).toBe("open");
    expect(await commitmentsRepo.listOpen()).toHaveLength(1);
  });
});
