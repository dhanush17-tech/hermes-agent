import { describe, expect, it } from "vitest";
import { parsePlannerStep } from "./agent-planner.js";

describe("parsePlannerStep", () => {
  it("parses a continue step", () => {
    const step = parsePlannerStep(
      '{"think":"capture screen","action":"continue","tool":"screen.observe","payload":{}}',
    );
    expect(step?.action).toBe("continue");
    expect(step?.tool).toBe("screen.observe");
  });

  it("parses finish", () => {
    const step = parsePlannerStep('{"action":"finish","final":"All done"}');
    expect(step?.action).toBe("finish");
    expect(step?.final).toBe("All done");
  });
});
