import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { findWorkspaceRoot } from "./workspace-root.js";

describe("findWorkspaceRoot", () => {
  it("finds repo root from apps/orchestrator", () => {
    const dir = resolve(import.meta.dirname, "../../../apps/orchestrator");
    const root = findWorkspaceRoot(dir);
    expect(resolve(root, "configs/risk-policy.yaml")).toContain("risk-policy.yaml");
  });
});
