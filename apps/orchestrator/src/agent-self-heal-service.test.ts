import { describe, expect, it } from "vitest";
import { isRecoverableAgentFailure } from "./agent-self-heal-service.js";

describe("agent-self-heal-service", () => {
  it("detects Arc osascript research failures", () => {
    const msg = `Research failed: Command failed: osascript -e tell application "Arc" tell window 3`;
    expect(isRecoverableAgentFailure(msg)).toBe(true);
  });

  it("ignores normal replies", () => {
    expect(isRecoverableAgentFailure("Here are three post ideas for this week.")).toBe(false);
  });
});
