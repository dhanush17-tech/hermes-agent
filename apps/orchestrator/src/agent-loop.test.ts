import { describe, expect, it } from "vitest";
import { isStaleTemporalClaim, shouldContinueAgentLoop } from "./agent-loop.js";

describe("agent-loop", () => {
  it("detects stale release claims", () => {
    expect(
      isStaleTemporalClaim(
        "The iPhone 17 Pro isn't out yet — expected in fall 2025.",
      ),
    ).toBe(true);
  });

  it("requires tool evidence for live lookup when no tools ran", () => {
    const loop = shouldContinueAgentLoop({
      response: {
        final: "The iPhone 17 Pro isn't out yet.",
        toolRequests: [],
      },
      rounds: 1,
      maxRounds: 5,
      requireToolEvidence: true,
      hadSuccessfulToolResults: false,
    });
    expect(loop.continue).toBe(true);
  });

  it("blocks training-data fallback without successful tools", () => {
    const loop = shouldContinueAgentLoop({
      response: {
        final: "As of my training data, here is general guidance on pricing.",
        toolRequests: [],
      },
      rounds: 2,
      maxRounds: 5,
      requireToolEvidence: false,
      hadSuccessfulToolResults: false,
      hadToolFailures: true,
    });
    expect(loop.continue).toBe(true);
    if (loop.continue) expect(loop.reason).toBe("tool_failed");
  });
});
