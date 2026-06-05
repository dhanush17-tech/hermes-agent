import { describe, expect, it } from "vitest";
import { classifyResearchType, createResearchRunPlan } from "./research-planner.js";

describe("research planner", () => {
  it("classifies implementation plan questions", () => {
    const plan = createResearchRunPlan("What is the best implementation plan for DevLabs OS?");
    expect(plan.researchType).toBe("implementation_plan");
    expect(plan.outputFormat).toBe("implementation_plan");
    expect(plan.selectedSources.length).toBeGreaterThan(0);
  });

  it("classifies competitive analysis", () => {
    expect(classifyResearchType("competitive landscape for job boards", "memo")).toBe(
      "competitive_analysis",
    );
  });

  it("includes web for current freshness", () => {
    const plan = createResearchRunPlan("latest trends in AI agents 2026");
    expect(plan.selectedSources).toContain("web");
  });
});
