import { describe, expect, it } from "vitest";
import { matchSkills, scoreTrigger } from "./skill-matcher.js";
import { candidateToSkill } from "./skill-promoter.js";
import { skillAllowsTool, inferPermissionsFromSteps } from "./skill-permissions.js";
import type { SkillDefinition } from "./types.js";

const sampleSkill: SkillDefinition = {
  name: "skill.morning-inbox-api",
  description: "Scan urgent Gmail threads",
  version: "1.0.0",
  permissions: ["gmail.read"],
  risk: "read_only",
  triggerExamples: ["scan my urgent inbox", "check urgent email"],
  steps: [{ tool: "gmail.check_inbox", payload: { limit: 10 } }],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  status: "active",
  repairScope: "skill",
};

describe("skill-matcher", () => {
  it("matches trigger phrases", async () => {
    const match = await matchSkills("please scan my urgent inbox today", [sampleSkill]);
    expect(match?.skill.name).toBe("skill.morning-inbox-api");
    expect(match?.score).toBeGreaterThan(0.45);
  });

  it("scores exact triggers highest", () => {
    expect(scoreTrigger("scan my urgent inbox", "scan my urgent inbox")).toBe(1);
  });

  it("does not dispatch skills on resume phrases", async () => {
    const match = await matchSkills("go ahead", [sampleSkill]);
    expect(match).toBeNull();
  });
});

describe("skill-permissions", () => {
  it("infers gmail.read from gmail tools", () => {
    expect(inferPermissionsFromSteps([{ tool: "gmail.search" }])).toContain("gmail.read");
  });

  it("denies tools missing from skill permissions", () => {
    const result = skillAllowsTool(["gmail.read"], "gmail.send");
    expect(result.allowed).toBe(false);
    expect(result.missing).toContain("gmail.write");
  });
});

describe("skill-promoter", () => {
  it("converts runtime candidate to skill definition", () => {
    const skill = candidateToSkill({
      name: "detect conflicts",
      description: "Find calendar email conflicts",
      triggerExamples: ["calendar email conflicts"],
      steps: [{ toolName: "gmail.search", payload: { q: "logistics" }, reason: "search" }],
    });
    expect(skill.name).toMatch(/^skill\./);
    expect(skill.permissions).toContain("gmail.read");
    expect(skill.steps[0]?.tool).toBe("gmail.search");
  });
});
