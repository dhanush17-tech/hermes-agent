import { describe, expect, it } from "vitest";
import { SkillRegistry } from "@hermes-os/skills";
import { SkillRouter } from "./skill-router.js";
import type { SkillDefinition } from "@hermes-os/skills";

const sample: SkillDefinition = {
  name: "skill.morning-inbox-api",
  description: "Scan inbox",
  version: "1.0.0",
  permissions: ["gmail.read"],
  risk: "read_only",
  triggerExamples: ["scan my urgent inbox"],
  steps: [{ tool: "gmail.check_inbox", payload: { limit: 5 } }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  status: "active",
  repairScope: "skill",
};

describe("SkillRouter", () => {
  it("matches active skills by trigger", async () => {
    const registry = new SkillRegistry("/tmp/skills", "/tmp/sandbox");
    registry.register(sample);
    const router = new SkillRouter({
      registry,
      runner: { run: async () => ({ skillName: sample.name, steps: [], success: true }) } as never,
      executor: { invoke: async () => ({ status: "success" }) } as never,
      workspaceRoot: "/tmp",
    });
    const match = await router.match("please scan my urgent inbox");
    expect(match?.skill.name).toBe("skill.morning-inbox-api");
  });
});
