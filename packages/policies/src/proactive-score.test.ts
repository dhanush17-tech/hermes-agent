import { describe, expect, it } from "vitest";
import { computeProactiveScore } from "./proactive-score.js";

describe("computeProactiveScore", () => {
  it("scores urgent items above daily brief threshold", () => {
    expect(computeProactiveScore(9, 9, 9, 1)).toBeGreaterThanOrEqual(70);
  });

  it("stores low-value silently", () => {
    expect(computeProactiveScore(2, 2, 2, 5)).toBeLessThan(40);
  });
});
