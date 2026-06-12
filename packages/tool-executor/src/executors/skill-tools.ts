import { llmCall, MODELS } from "@hermes-os/llm-client";
import type { ToolContext, ToolResult } from "@hermes-os/shared";
import {
  SkillRegistry,
  SkillRunner,
  candidateToSkill,
  promoteCandidate,
  promoteAllCandidates,
  inferPermissionsFromSteps,
  type SkillDefinition,
} from "@hermes-os/skills";
import type { ToolExecutor } from "../tool-executor.js";

export type SkillToolsDeps = {
  workspaceRoot: string;
  registry: SkillRegistry;
  runner: SkillRunner;
  executor: ToolExecutor;
  catalog: string[];
};

export async function executeSkillList(deps: SkillToolsDeps): Promise<ToolResult> {
  const skills = deps.registry.list();
  return {
    status: "success",
    data: {
      skills: skills.map((s) => ({
        name: s.name,
        description: s.description,
        status: s.status,
        risk: s.risk,
        triggers: s.triggerExamples.slice(0, 3),
        lastSuccessfulRun: s.lastSuccessfulRun,
        failureCount: s.failureCount ?? 0,
      })),
    },
  };
}

export async function executeSkillDescribe(
  payload: unknown,
  deps: SkillToolsDeps,
): Promise<ToolResult> {
  const name = (payload as { name?: string }).name?.trim();
  if (!name) return { status: "denied", reason: "name required" };
  const skill = deps.registry.get(name);
  if (!skill) return { status: "denied", reason: `skill not found: ${name}` };
  return { status: "success", data: { skill } };
}

export async function executeSkillRun(
  payload: unknown,
  ctx: ToolContext,
  deps: SkillToolsDeps,
): Promise<ToolResult> {
  const body = payload as { name?: string; input?: unknown };
  const name = body.name?.trim();
  if (!name) return { status: "denied", reason: "name required" };

  const result = await deps.runner.run(name, body.input ?? {}, {
    dryRun: false,
  });

  if (!result.success) {
    if (result.error?.includes("Approval required")) {
      return { status: "denied", reason: result.error };
    }
    return { status: "denied", reason: result.error ?? "skill run failed" };
  }

  return { status: "success", data: { skill: name, steps: result.steps, actor: ctx.actor } };
}

export async function executeSkillRegister(
  payload: unknown,
  deps: SkillToolsDeps,
): Promise<ToolResult> {
  const body = payload as Partial<SkillDefinition> & {
    name?: string;
    description?: string;
    steps?: SkillDefinition["steps"];
    triggerExamples?: string[];
  };

  if (!body.name?.trim() || !body.description?.trim() || !body.steps?.length) {
    return { status: "denied", reason: "name, description, and steps required" };
  }

  const now = new Date().toISOString();
  const name = body.name.startsWith("skill.") ? body.name : `skill.${body.name}`;
  const skill: SkillDefinition = {
    name,
    description: body.description,
    version: body.version ?? "1.0.0",
    permissions: body.permissions ?? inferPermissionsFromSteps(body.steps),
    risk: body.risk ?? "low",
    triggerExamples: body.triggerExamples ?? [],
    inputSchema: body.inputSchema,
    steps: body.steps,
    testCases: body.testCases,
    owner: body.owner ?? "agent",
    createdAt: body.createdAt ?? now,
    updatedAt: now,
    status: body.status ?? "sandbox",
    repairScope: "skill",
  };

  const tests = await deps.runner.runTestCases(skill);
  if (tests.failed > 0) {
    return { status: "denied", reason: `skill tests failed: ${tests.errors.join("; ")}` };
  }

  const path = await deps.registry.persist(skill, skill.status === "active" ? "active" : "sandbox");
  if (skill.status === "sandbox") {
    const activated = await deps.registry.promoteFromSandbox(skill.name);
    return { status: "success", data: { skill: activated, path, tests } };
  }

  return { status: "success", data: { skill, path, tests } };
}

export async function executeSkillPromote(
  payload: unknown,
  deps: SkillToolsDeps,
): Promise<ToolResult> {
  const body = payload as { candidatePath?: string; promoteAll?: boolean };
  const candidatesDir = `${deps.workspaceRoot}/data/skill-candidates`;
  const sandboxDir = `${deps.workspaceRoot}/sandbox/generated_skills`;

  if (body.promoteAll) {
    const results = await promoteAllCandidates(candidatesDir, deps.registry, sandboxDir, deps.runner);
    return {
      status: "success",
      data: {
        promoted: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      },
    };
  }

  const candidatePath = body.candidatePath?.trim();
  if (!candidatePath) {
    return { status: "denied", reason: "candidatePath or promoteAll required" };
  }

  const result = await promoteCandidate(candidatePath, deps.registry, sandboxDir, deps.runner);
  if (!result.ok) {
    return {
      status: "denied",
      reason: `${result.error ?? "promotion failed"}${result.tests ? ` (${JSON.stringify(result.tests)})` : ""}`,
    };
  }
  return { status: "success", data: result };
}

export async function executeSkillAuthor(
  payload: unknown,
  deps: SkillToolsDeps,
): Promise<ToolResult> {
  const body = payload as { requirement?: string; name?: string };
  const requirement = body.requirement?.trim();
  if (!requirement) return { status: "denied", reason: "requirement required" };

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return { status: "denied", reason: "skill.author needs OPENROUTER_API_KEY" };
  }

  const system = [
    "Design a reusable Hermes skill using ONLY existing built-in tools.",
    `Available tools: ${deps.catalog.join(", ")}`,
    'Reply ONLY JSON: {"name":"skill.slug","description":"...","triggerExamples":["..."],"steps":[{"tool":"...","payload":{},"summary":"..."}]}',
    'Skill name MUST start with "skill.".',
    "No arbitrary code — only tool call steps.",
  ].join("\n");

  let raw: string;
  try {
    const res = await llmCall({
      model: MODELS.PRIMARY,
      max_tokens: 900,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: requirement },
      ],
    });
    raw = res.content ?? "";
  } catch (err) {
    return {
      status: "denied",
      reason: err instanceof Error ? err.message : "LLM call failed",
    };
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { status: "denied", reason: "author could not produce valid skill JSON" };
  }

  try {
    const draft = JSON.parse(raw.slice(start, end + 1)) as {
      name?: string;
      description?: string;
      triggerExamples?: string[];
      steps?: Array<{ tool?: string; payload?: unknown; summary?: string }>;
    };

    const steps = (draft.steps ?? [])
      .filter((s) => s.tool)
      .map((s) => ({ tool: s.tool!, payload: s.payload, summary: s.summary }));

    return executeSkillRegister(
      {
        name: body.name ?? draft.name,
        description: draft.description ?? requirement,
        triggerExamples: draft.triggerExamples ?? [requirement],
        steps,
        status: "sandbox",
      },
      deps,
    );
  } catch {
    return { status: "denied", reason: "invalid skill JSON from author" };
  }
}

export function createSkillRunner(
  registry: SkillRegistry,
  executor: ToolExecutor,
  workspaceRoot: string,
): SkillRunner {
  return new SkillRunner(registry, (toolName, toolPayload, summary) =>
    executor.invoke(
      toolName,
      toolPayload ?? {},
      { actor: "skill-runner", workspaceRoot, channel: "cli" },
      { summary },
    ),
  );
}

export function createSkillRegistry(workspaceRoot: string): SkillRegistry {
  return new SkillRegistry(
    `${workspaceRoot}/skills`,
    `${workspaceRoot}/sandbox/generated_skills`,
  );
}
