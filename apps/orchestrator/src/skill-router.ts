import { join } from "node:path";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { matchSkills, promoteAllCandidates, type SkillRegistry, SkillRunner } from "@hermes-os/skills";

export type SkillRouterDeps = {
  registry: SkillRegistry;
  runner: SkillRunner;
  executor: ToolExecutor;
  workspaceRoot: string;
};

export class SkillRouter {
  constructor(private readonly deps: SkillRouterDeps) {}

  async match(message: string) {
    return matchSkills(message, this.deps.registry.listActive());
  }

  listActive() {
    return this.deps.registry.listActive();
  }

  async tryRun(message: string, ctx: ToolContext): Promise<string | null> {
    const match = await this.match(message);
    if (!match) return null;

    const result = await this.deps.runner.run(match.skill.name, {}, { dryRun: false });
    if (!result.success) {
      return `Matched skill ${match.skill.name} (${match.matchedTrigger}) but run failed: ${result.error}`;
    }

    const summaries = result.steps
      .map((s) => {
        const data =
          s.data && typeof s.data === "object" ?
            JSON.stringify(s.data).slice(0, 400)
          : String(s.data ?? "");
        return `• ${s.tool}: ${data || "ok"}`;
      })
      .join("\n");

    return [
      `Ran skill **${match.skill.name}** (matched: "${match.matchedTrigger}")`,
      match.skill.description,
      "",
      summaries,
    ].join("\n");
  }

  async promotePendingCandidates(): Promise<number> {
    const candidatesDir = join(this.deps.workspaceRoot, "data", "skill-candidates");
    const sandboxDir = join(this.deps.workspaceRoot, "sandbox", "generated_skills");
    const results = await promoteAllCandidates(
      candidatesDir,
      this.deps.registry,
      sandboxDir,
      this.deps.runner,
    );
    return results.filter((r) => r.ok).length;
  }
}
