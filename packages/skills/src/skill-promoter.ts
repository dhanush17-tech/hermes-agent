import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { SkillRegistry } from "./skill-registry.js";
import { moveSkillCandidateToSandbox, slugify } from "./skill-registry.js";
import { inferPermissionsFromSteps } from "./skill-permissions.js";
import type { SkillCandidateDraft, SkillDefinition } from "./types.js";
import type { SkillRunner } from "./skill-runner.js";
import { deindexSkill, indexSkill } from "./skill-indexer.js";

export function candidateToSkill(
  candidate: SkillCandidateDraft,
  status: SkillDefinition["status"] = "sandbox",
): SkillDefinition {
  const now = new Date().toISOString();
  const steps = (candidate.steps ?? []).map((s) => ({
    tool: s.toolName,
    payload: s.payload,
    summary: s.reason,
  }));

  const name = candidate.name.startsWith("skill.") ? candidate.name : `skill.${slugify(candidate.name)}`;

  return {
    name,
    description: candidate.description,
    version: "1.0.0",
    permissions: inferPermissionsFromSteps(steps),
    risk: inferRiskFromSteps(steps),
    triggerExamples: candidate.triggerExamples ?? [],
    steps,
    testCases: [
      {
        description: "steps resolve and permissions inferred",
        expectTools: steps.map((s) => s.tool),
      },
    ],
    owner: "agent",
    createdAt: candidate.createdAt ?? now,
    updatedAt: now,
    status,
    repairScope: "skill",
  };
}

function inferRiskFromSteps(steps: Array<{ tool: string }>): SkillDefinition["risk"] {
  const writeTools = new Set([
    "gmail.send",
    "gmail.send_draft",
    "social.post",
    "imessage.send",
    "filesystem.delete",
    "payments.submit",
  ]);
  if (steps.some((s) => writeTools.has(s.tool))) return "high";
  if (steps.some((s) => s.tool.startsWith("browser.") && !s.tool.includes("observe") && !s.tool.includes("extract"))) {
    return "medium";
  }
  if (steps.every((s) => s.tool.includes("read") || s.tool.includes("search") || s.tool === "memory.search")) {
    return "read_only";
  }
  return "low";
}

export async function listSkillCandidates(candidatesDir: string): Promise<string[]> {
  try {
    const entries = await readdir(candidatesDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".json") && !e.name.includes(".promoted-"))
      .map((e) => join(candidatesDir, e.name));
  } catch {
    return [];
  }
}

export async function loadSkillCandidate(path: string): Promise<SkillCandidateDraft> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SkillCandidateDraft;
}

export type PromoteResult = {
  ok: boolean;
  skill?: SkillDefinition;
  path?: string;
  tests?: { passed: number; failed: number; errors: string[] };
  error?: string;
};

export async function promoteCandidate(
  candidatePath: string,
  registry: SkillRegistry,
  sandboxDir: string,
  runner: SkillRunner,
  options?: { autoActivate?: boolean },
): Promise<PromoteResult> {
  try {
    const candidate = await loadSkillCandidate(candidatePath);
    const skill = candidateToSkill(candidate, "sandbox");
    if (skill.steps.length === 0) {
      return { ok: false, error: "Candidate has no steps" };
    }

    const path = await moveSkillCandidateToSandbox(candidatePath, sandboxDir, skill);
    registry.register(skill);

    const tests = await runner.runTestCases(skill);
    if (tests.failed > 0) {
      return { ok: false, skill, path, tests, error: tests.errors.join("; ") };
    }

    if (options?.autoActivate ?? true) {
      const activated = await registry.promoteFromSandbox(skill.name);
      await onSkillStatusChange(activated, "sandbox");
      return { ok: true, skill: activated, path, tests };
    }

    await onSkillStatusChange(skill, undefined);
    return { ok: true, skill, path, tests };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function onSkillStatusChange(
  skill: SkillDefinition,
  previousStatus?: SkillDefinition["status"],
): Promise<void> {
  if (skill.status === "active" && previousStatus !== "active") {
    await indexSkill(skill).catch((err) => {
      console.error(`[skill-indexer] Failed to index ${skill.name}:`, err);
    });
    return;
  }

  if (skill.status !== "active" && previousStatus === "active") {
    await deindexSkill(skill.name).catch((err) => {
      console.error(`[skill-indexer] Failed to deindex ${skill.name}:`, err);
    });
  }
}

export async function promoteAllCandidates(
  candidatesDir: string,
  registry: SkillRegistry,
  sandboxDir: string,
  runner: SkillRunner,
): Promise<PromoteResult[]> {
  const paths = await listSkillCandidates(candidatesDir);
  const results: PromoteResult[] = [];
  for (const path of paths) {
    results.push(await promoteCandidate(path, registry, sandboxDir, runner));
  }
  return results;
}
