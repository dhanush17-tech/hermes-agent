import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDb, runMigrations, createContextGraphService } from "@hermes-os/context-graph";
import { ResearchEngine } from "./research-engine.js";
import { createResearchRunPlan } from "./research-planner.js";
import { applySourceSelection } from "./source-selector.js";

describe("ResearchEngine", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hermes-research-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("gathers internal evidence from context graph and local files", async () => {
    const docsDir = join(dir, "docs");
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(
      join(docsDir, "devlabs.md"),
      "# DevLabs OS\nProof-of-work talent intelligence platform. Not a job board.",
    );

    const { db, sqlite } = createDb(join(dir, "graph.sqlite"));
    runMigrations(sqlite);
    const graph = createContextGraphService(db);
    await graph.upsertProject({
      name: "DevLabs OS",
      description: "Proof-of-work talent intelligence for founders",
      status: "active",
      priority: 5,
    });

    const memory = {
      formatContextForPrompt: async () => "(No stored memories yet.)",
      search: async () => [],
      remember: async () => ({}),
    };

    const engine = new ResearchEngine({
      memory,
      workspaceRoot: dir,
      contextGraph: graph,
      gmail: null,
      calendar: null,
    });

    const bundle = await engine.gatherEvidence(
      applySourceSelection(createResearchRunPlan("best implementation plan for DevLabs OS")),
      { skipWeb: true },
    );

    expect(bundle.evidence.length).toBeGreaterThan(0);
    expect(bundle.evidence.some((e) => e.sourceKind === "context_graph")).toBe(true);
    expect(bundle.evidence.some((e) => e.sourceKind === "local_files")).toBe(true);

    const answer = await engine.run("What is the best implementation plan for DevLabs OS?", {
      skipWeb: true,
      skipMemoryWrite: true,
    });
    expect(answer).toMatch(/DevLabs|proof-of-work/i);
  });
});
