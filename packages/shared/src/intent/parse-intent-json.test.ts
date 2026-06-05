import { describe, expect, it } from "vitest";
import { parseIntentJson } from "./parse-intent-json.js";

describe("parseIntentJson", () => {
  it("parses fenced JSON", () => {
    const raw = '```json\n{"intent":"research","confidence":0.9}\n```';
    expect(parseIntentJson(raw)?.intent).toBe("research");
  });

  it("parses entities", () => {
    const raw = JSON.stringify({
      intent: "approval_response",
      confidence: 1,
      entities: { approvalAction: "approve", approvalId: "abc" },
    });
    expect(parseIntentJson(raw)?.entities?.approvalId).toBe("abc");
  });
});
