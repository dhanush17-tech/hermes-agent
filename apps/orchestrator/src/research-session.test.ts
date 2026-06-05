import { describe, expect, it } from "vitest";
import { buildResearchFollowUpPrompt } from "./research-session.js";

describe("research session", () => {
  it("builds follow-up prompt with prior topic", () => {
    const prompt = buildResearchFollowUpPrompt("good pillow", "side sleeper, $30 budget");
    expect(prompt).toContain("good pillow");
    expect(prompt).toContain("side sleeper, $30 budget");
  });
});
