import { describe, expect, it } from "vitest";
import {
  looksLikeLeakedReasoning,
  stripModelReasoning,
} from "./reply-sanitize.js";

describe("stripModelReasoning", () => {
  it("extracts last draft from GLM-style output", () => {
    const raw = `1. **Analyze**: They said Stanford.
*Draft 1:* "Awesome, you're in Sunnyvale territory."
*Draft 2:* "Nice spot — Stanford is right by Google."`;
    expect(stripModelReasoning(raw)).toBe("Nice spot — Stanford is right by Google.");
  });

  it("passes through normal short replies", () => {
    expect(stripModelReasoning("Got it — you're at 566 Arguello Way in Stanford.")).toBe(
      "Got it — you're at 566 Arguello Way in Stanford.",
    );
  });

  it("returns empty when weather query only has numbered analysis", () => {
    const raw = `1. **Analyze the user's request:** The user is asking "how's the weather here".
2. **Understand 'here':** I need to determine where "here" is.
3. **Consult stored memories:**
- (durable_facts): User lives in 566 arguello way in stanford.
4. **Determine the task:** Check weather for Stanford.
5. **Select the tool:**`;
    expect(looksLikeLeakedReasoning(raw)).toBe(true);
    expect(stripModelReasoning(raw)).toBe("");
  });
});
