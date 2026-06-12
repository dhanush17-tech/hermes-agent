import type { ToolResult } from "@hermes-os/shared";
import type { SkillRegistry } from "./skill-registry.js";
import { skillAllowsTool } from "./skill-permissions.js";
import type { SkillDefinition } from "./types.js";

export type SkillInvoke = (
  toolName: string,
  payload: unknown,
  summary?: string,
) => Promise<ToolResult>;

export type SkillRunResult = {
  skillName: string;
  steps: Array<{ tool: string; status: string; data?: unknown; reason?: string }>;
  success: boolean;
  error?: string;
};

export class SkillRunner {
  constructor(
    private readonly registry: SkillRegistry,
    private readonly invoke: SkillInvoke,
  ) {}

  async run(
    name: string,
    input: unknown = {},
    options?: { dryRun?: boolean },
  ): Promise<SkillRunResult> {
    const skill = this.registry.get(name);
    if (!skill) {
      return { skillName: name, steps: [], success: false, error: `Skill not found: ${name}` };
    }

    const steps: SkillRunResult["steps"] = [];

    for (const step of skill.steps) {
      const perm = skillAllowsTool(skill.permissions, step.tool);
      if (!perm.allowed) {
        const error = `Skill ${name} missing permissions for ${step.tool}: ${perm.missing?.join(", ")}`;
        await this.registry.recordRun(name, false);
        return { skillName: name, steps, success: false, error };
      }

      if (options?.dryRun) {
        steps.push({ tool: step.tool, status: "dry_run" });
        continue;
      }

      const merged =
        input && typeof input === "object" ?
          { ...(step.payload as object), ...(input as object) }
        : (step.payload ?? input);

      const result = await this.invoke(step.tool, merged, step.summary ?? `Skill ${name}: ${step.tool}`);

      if (result.status === "pending_approval") {
        return {
          skillName: name,
          steps,
          success: false,
          error: result.message ?? `Approval required at ${step.tool}`,
        };
      }
      if (result.status === "denied") {
        const browserFallback = await this.tryBrowserGmailFallback(step, input, result.reason ?? "");
        if (browserFallback) {
          steps.push({ tool: browserFallback.tool, status: "success", data: browserFallback.data });
          continue;
        }
        steps.push({ tool: step.tool, status: "denied", reason: result.reason });
        await this.registry.recordRun(name, false);
        return {
          skillName: name,
          steps,
          success: false,
          error: `Skill ${name} failed at ${step.tool}: ${result.reason}`,
        };
      }

      steps.push({ tool: step.tool, status: "success", data: result.data });
    }

    await this.registry.recordRun(name, true);
    return { skillName: name, steps, success: true };
  }

  private async tryBrowserGmailFallback(
    step: SkillDefinition["steps"][number],
    input: unknown,
    reason: string,
  ): Promise<{ tool: string; data: unknown } | null> {
    if (step.tool !== "gmail.check_inbox" || !/token|oauth|not authorized/i.test(reason)) {
      return null;
    }
    const email =
      typeof step.payload === "object" && step.payload !== null && "email" in step.payload
        ? String((step.payload as { email?: unknown }).email ?? "")
        : typeof input === "object" && input !== null && "email" in input
          ? String((input as { email?: unknown }).email ?? "")
          : "";
    const access = await this.invoke("gmail.resolve_access", { email: email || undefined }, "Resolve Gmail browser access");
    if (access.status !== "success") return null;
    const browser = await this.invoke(
      "gmail.browser_check_inbox",
      { email: email || undefined, browser: "arc" },
      "Browser Gmail fallback",
    );
    if (browser.status !== "success") return null;
    return { tool: "gmail.browser_check_inbox", data: browser.data };
  }

  async runTestCases(skill: SkillDefinition): Promise<{ passed: number; failed: number; errors: string[] }> {
    const cases = skill.testCases ?? [];
    if (cases.length === 0) {
      const dry = await this.run(skill.name, {}, { dryRun: true });
      return dry.success ?
          { passed: 1, failed: 0, errors: [] }
        : { passed: 0, failed: 1, errors: [dry.error ?? "dry run failed"] };
    }

    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const testCase of cases) {
      const dry = await this.run(skill.name, testCase.input ?? {}, { dryRun: true });
      if (!dry.success) {
        failed += 1;
        errors.push(`${testCase.description}: ${dry.error}`);
        continue;
      }
      if (testCase.expectTools?.length) {
        const tools = skill.steps.map((s) => s.tool);
        const missing = testCase.expectTools.filter((t) => !tools.includes(t));
        if (missing.length) {
          failed += 1;
          errors.push(`${testCase.description}: missing tools ${missing.join(", ")}`);
          continue;
        }
      }
      passed += 1;
    }

    return { passed, failed, errors };
  }
}
