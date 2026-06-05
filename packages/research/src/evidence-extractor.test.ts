import { describe, expect, it } from "vitest";
import { detectEvidenceConflicts, extractEvidenceFromSnippets } from "./evidence-extractor.js";

describe("evidence extractor", () => {
  it("extracts evidence with confidence by source", () => {
    const evidence = extractEvidenceFromSnippets([
      {
        sourceKind: "memory",
        sourceId: "memory:0",
        title: "Preference",
        excerpt: "User prefers side-sleeper pillows",
        observedAt: new Date().toISOString(),
      },
    ]);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.confidence).toBeGreaterThan(0.8);
  });

  it("flags empty evidence as conflict", () => {
    expect(detectEvidenceConflicts([])).toContain(
      "No grounded evidence retrieved — treat conclusions as low confidence.",
    );
  });
});
