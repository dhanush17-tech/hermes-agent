import { describe, expect, it } from "vitest";
import { isDeferredActionFinal } from "./primary-agent.js";

describe("isDeferredActionFinal", () => {
  it("detects promise-to-check replies", () => {
    expect(
      isDeferredActionFinal(
        "You're right — you're at 566 Arguello Way in Stanford. Let me check the weather there.",
      ),
    ).toBe(true);
    expect(isDeferredActionFinal("I'll check that for you.")).toBe(true);
    expect(isDeferredActionFinal("It's 72°F and sunny.")).toBe(false);
    expect(isDeferredActionFinal(null)).toBe(false);
  });
});
