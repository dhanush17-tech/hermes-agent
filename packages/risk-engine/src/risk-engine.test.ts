import { describe, expect, it } from "vitest";
import { RiskEngine } from "./risk-engine.js";

describe("RiskEngine", () => {
  it("detects important unread gmail", async () => {
    const engine = new RiskEngine();
    const risks = await engine.detect({
      sourceItems: [
        {
          sourceType: "gmail",
          title: "AWS venue logistics for Demo Day",
          content: "Lisa Bagley <lisa@aws.com>\nPlease confirm timing",
          metadata: null,
          externalId: "gmail:1",
        },
      ],
      openLoops: [],
      tasks: [],
    });
    expect(risks.some((r) => r.category === "communication")).toBe(true);
    expect(risks[0]?.score).toBeGreaterThan(40);
  });

  it("detects overloaded calendar", async () => {
    const engine = new RiskEngine();
    const items = Array.from({ length: 7 }, (_, i) => ({
      sourceType: "calendar",
      title: `Meeting ${i}`,
      content: "today",
      metadata: null,
      externalId: `cal:${i}`,
    }));
    const risks = await engine.detect({ sourceItems: items, openLoops: [], tasks: [] });
    expect(risks.some((r) => r.category === "routine")).toBe(true);
  });
});
