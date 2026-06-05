import { describe, expect, it } from "vitest";
import { PolicyEngine } from "./policy-engine.js";
import type { RiskPolicyFile } from "./risk-policy-schema.js";

const testPolicy: RiskPolicyFile = {
  default: "deny_if_unknown",
  tools: {
    "social.post": { risk: "high", approval: "always" },
    "gmail.read": { risk: "read", approval: false },
    "filesystem.write": { risk: "medium", approval: "if_outside_workspace" },
    "terminal.run": { risk: "dynamic", approval: "if_destructive" },
  },
  blocked: ["bypass_user_approval"],
};

describe("PolicyEngine", () => {
  const engine = new PolicyEngine(testPolicy);

  it("denies unknown tools", () => {
    const result = engine.evaluate("unknown.tool", { workspaceRoot: "/tmp" });
    expect(result.allowed).toBe(false);
  });

  it("blocks listed tools", () => {
    const result = engine.evaluate("bypass_user_approval", { workspaceRoot: "/tmp" });
    expect(result.allowed).toBe(false);
  });

  it("requires approval for social.post", () => {
    const result = engine.evaluate("social.post", { workspaceRoot: "/tmp" });
    expect(result.requiresApproval).toBe(true);
  });

  it("filesystem.write inside workspace skips approval", () => {
    const result = engine.evaluate("filesystem.write", {
      workspaceRoot: "/proj",
      targetPath: "/proj/src/a.ts",
    });
    expect(result.requiresApproval).toBe(false);
  });
});
