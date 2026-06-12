import { join } from "node:path";
import { llmCall } from "@hermes-os/llm-client";
import type { SkillRegistry } from "./skill-registry.js";
import type { SkillDefinition } from "./types.js";

const CORE_PATH_PREFIXES = [
  "apps/orchestrator/src/orchestrator",
  "apps/orchestrator/src/system",
  "packages/policies/",
  "packages/approval-broker/",
  "packages/tool-executor/src/tool-executor",
  "configs/risk-policy",
];

export function isCorePath(targetPath: string): boolean {
  const normalized = targetPath.replace(/\\/g, "/");
  return CORE_PATH_PREFIXES.some((p) => normalized.includes(p));
}

export function skillRepairAllowed(skill: SkillDefinition, targetPath?: string): boolean {
  if (skill.repairScope === "core") return false;
  if (targetPath && isCorePath(targetPath)) return false;
  return true;
}

export type SelfRepairProposal = {
  instruction: string;
  targetSkill: string;
  reason: string;
};

export async function proposeSkillRepair(
  skill: SkillDefinition,
  error: string,
  failedTool: string,
): Promise<SelfRepairProposal | null> {
  if (skill.repairScope !== "skill") return null;

  let raw: string | null;
  try {
    const res = await llmCall({
      messages: [
        {
          role: "system",
          content:
            'Reply ONLY JSON: {"instruction":"what to change","steps":[{"tool":"...","payload":{},"summary":"..."}],"reason":"..."}',
        },
        {
          role: "user",
          content: [
            `Skill ${skill.name} failed at tool ${failedTool}.`,
            `Error: ${error}`,
            `Current steps: ${JSON.stringify(skill.steps)}`,
            "Propose a minimal fix to the skill steps JSON only (not core code).",
          ].join("\n"),
        },
      ],
      max_tokens: 600,
    });
    raw = res.content;
  } catch {
    return null;
  }

  if (!raw) return null;

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const draft = JSON.parse(raw.slice(start, end + 1)) as {
      instruction?: string;
      reason?: string;
      steps?: SkillDefinition["steps"];
    };
    if (!draft.steps?.length) return null;
    return {
      instruction: draft.instruction ?? `Fix ${skill.name} after ${failedTool} failure`,
      targetSkill: skill.name,
      reason: draft.reason ?? error,
    };
  } catch {
    return null;
  }
}

export async function applySkillRepair(
  registry: SkillRegistry,
  skillName: string,
  steps: SkillDefinition["steps"],
  sandboxDir: string,
): Promise<SkillDefinition | null> {
  const skill = registry.get(skillName);
  if (!skill) return null;

  const repaired: SkillDefinition = {
    ...skill,
    steps,
    status: "sandbox",
    updatedAt: new Date().toISOString(),
    version: bumpPatch(skill.version),
  };

  await registry.persist(repaired, "sandbox");
  return repaired;
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  const patch = Number(parts[2] ?? 0) + 1;
  return `${parts[0] ?? "1"}.${parts[1] ?? "0"}.${patch}`;
}

export function sandboxSkillPath(workspaceRoot: string, skillName: string): string {
  return join(workspaceRoot, "sandbox", "generated_skills", `${skillName}.skill.json`);
}
