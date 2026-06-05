import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDb, runMigrations } from "../db.js";
import { createContextGraphService } from "./graph-service.js";
import { extractFactsFromSourceItems } from "./extraction-pipeline.js";

describe("ContextGraphService", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-graph-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts and applies facts from gmail sources", async () => {
    const { db, sqlite } = createDb(join(dir, "test.sqlite"));
    runMigrations(sqlite);
    const graph = createContextGraphService(db);
    const now = new Date().toISOString();

    const src = await graph.upsertSourceItem({
      sourceType: "gmail",
      externalId: "gmail:thread1",
      title: "Follow up on venue logistics",
      content: "Lisa Chen <lisa@example.com>\nPlease confirm final details by Friday.",
      metadata: JSON.stringify({ from: "Lisa Chen <lisa@example.com>" }),
    });

    const facts = extractFactsFromSourceItems([
      {
        ...src,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect(facts.openLoops.length).toBeGreaterThan(0);
    expect(facts.people.length).toBeGreaterThan(0);

    const applied = await graph.applyExtractedFacts(facts);
    expect(applied.people).toBeGreaterThan(0);
    expect(applied.openLoops).toBeGreaterThan(0);

    const people = await graph.findPeople("lisa");
    expect(people.some((p) => p.emails.includes("lisa@example.com"))).toBe(true);
  });

  it("reports who is waiting on you with evidence", async () => {
    const { db, sqlite } = createDb(join(dir, "test2.sqlite"));
    runMigrations(sqlite);
    const graph = createContextGraphService(db);
    const now = new Date().toISOString();

    const src = await graph.upsertSourceItem({
      sourceType: "gmail",
      externalId: "gmail:wait1",
      title: "Waiting for your reply",
      content: "Jordan <jordan@startup.io>\nStill waiting for your reply on the term sheet.",
      metadata: JSON.stringify({ from: "Jordan <jordan@startup.io>" }),
    });

    await graph.applyExtractedFacts(
      extractFactsFromSourceItems([
        {
          ...src,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );

    const waiting = await graph.getWhoIsWaitingOnYou();
    expect(waiting.length).toBeGreaterThan(0);
    const report = graph.formatWaitingOnYouReport(waiting);
    expect(report).toMatch(/waiting on you/i);
    expect(report).toMatch(/Suggested reply/i);
    expect(waiting[0]!.evidence.length + waiting[0]!.openLoopIds.length).toBeGreaterThan(0);
  });
});
