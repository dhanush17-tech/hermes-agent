import { describe, expect, it } from "vitest";
import { clarifyOrAssume } from "./clarify-or-assume.js";
import type { PersonalizationContext } from "@hermes-os/memory";

const emptyCtx: PersonalizationContext = {
  preferences: [],
  constraints: [],
  unknowns: ["skin type", "concerns", "budget"],
  confidence: "low",
};

describe("clarifyOrAssume", () => {
  it("asks for skin type before recommending moisturizer", () => {
    const result = clarifyOrAssume("best moisturizer for me", "skincare", emptyCtx);
    expect(result.action).toBe("ask");
    if (result.action === "ask") {
      expect(result.question.toLowerCase()).toContain("skin type");
    }
  });

  it("proceeds when oily skin is in the query", () => {
    const result = clarifyOrAssume("best moisturizer, I have oily skin", "skincare", emptyCtx);
    expect(result.action).toBe("proceed");
  });

  it("proceeds for sale/price questions without asking budget first", () => {
    const result = clarifyOrAssume("also is the iPhone 17 pro on sale or a price drop?", "phone", emptyCtx);
    expect(result.action).toBe("proceed");
    if (result.action === "proceed") {
      expect(result.assumptions.join(" ").toLowerCase()).toMatch(/pricing|sales/);
    }
  });

  it("ignores irrelevant founder memories in assumptions", () => {
    const ctx: PersonalizationContext = {
      preferences: ["founder-energy vibe", "oily skin"],
      constraints: [],
      unknowns: [],
      confidence: "medium",
    };
    const result = clarifyOrAssume("best moisturizer", "skincare", ctx);
    expect(result.action).toBe("proceed");
    if (result.action === "proceed") {
      expect(result.assumptions.join(" ")).not.toContain("founder");
      expect(result.assumptions.join(" ")).toContain("oily skin");
    }
  });
});
