import { describe, expect, it } from "vitest";
import {
  buildResearchFollowUpPrompt,
  createResearchSession,
  handleStructuredFollowUp,
  isNewProductQuestion,
  isResearchFollowUpMessage,
  isStructuredProductFollowUp,
  shouldHandleWithResearchFlow,
  wantsOpenPurchaseInBrowser,
} from "./research-session.js";

describe("research session", () => {
  it("builds follow-up prompt with prior topic", () => {
    const prompt = buildResearchFollowUpPrompt("good pillow", "side sleeper, $30 budget");
    expect(prompt).toContain("good pillow");
    expect(prompt).toContain("side sleeper, $30 budget");
    expect(prompt.toLowerCase()).toContain("do not return new generic search links");
  });

  it("does not auto-open browser for generic shopping asks", () => {
    expect(wantsOpenPurchaseInBrowser("I want to buy a pillow, give me the best link")).toBe(false);
    expect(wantsOpenPurchaseInBrowser("open the first one in Arc")).toBe(true);
  });

  it("treats personalized shopping follow-ups as research continuation", () => {
    expect(isResearchFollowUpMessage("you know about me so recommend me something")).toBe(true);
    const session = createResearchSession("best pillow to buy", "product_recommendation");
    expect(shouldHandleWithResearchFlow("you know about me so recommend me something", session)).toBe(true);
  });

  it("structured follow-up explains assumptions", () => {
    const session = createResearchSession("best pillow", "product_recommendation");
    session.structuredResult = {
      recommendation: {
        winner: {
          title: "Coop Pillow",
          url: "https://coopsleepgoods.com/products/the-original-pillow",
          retailer: "Coop",
          features: [],
          evidence: [],
        },
        alternatives: [],
        assumptions: ["under $100"],
        userPreferencesUsed: [],
        unknowns: ["sleep position"],
        reasoning: "Adjustable fill.",
        confidence: "medium",
      },
    };
    const reply = handleStructuredFollowUp(session, "what assumptions did you use");
    expect(reply).toMatch(/under \$100|Adjustable|personal memory/i);
  });

  it("does not treat a new product question as a pillow follow-up", () => {
    const session = createResearchSession("best pillow to buy right now", "product_recommendation");
    session.structuredResult = {
      recommendation: {
        winner: {
          title: "Coop Pillow",
          url: "https://coopsleepgoods.com/products/the-original-pillow",
          retailer: "Coop",
          features: [],
          evidence: [],
        },
        alternatives: [],
        assumptions: ["prefers soft"],
        userPreferencesUsed: ["prefers soft"],
        unknowns: [],
        reasoning: "Soft fill.",
        confidence: "medium",
      },
    };

    expect(isNewProductQuestion("also is the iPhone 17 pro on sale or a price drop?", session)).toBe(true);
    expect(isStructuredProductFollowUp("also is the iPhone 17 pro on sale or a price drop?", session)).toBe(false);
    expect(handleStructuredFollowUp(session, "also is the iPhone 17 pro on sale or a price drop?")).toBeNull();
  });

  it("returns purchase link for same-product follow-up", () => {
    const session = createResearchSession("best pillow to buy", "product_recommendation");
    session.structuredResult = {
      recommendation: {
        winner: {
          title: "Coop Pillow",
          url: "https://coopsleepgoods.com/products/the-original-pillow",
          retailer: "Coop",
          features: [],
          evidence: [],
        },
        alternatives: [],
        assumptions: [],
        userPreferencesUsed: [],
        unknowns: [],
        reasoning: "Adjustable fill.",
        confidence: "medium",
      },
    };

    expect(isStructuredProductFollowUp("give me the purchase link", session)).toBe(true);
    expect(handleStructuredFollowUp(session, "give me the purchase link")).toContain(
      "https://coopsleepgoods.com/products/the-original-pillow",
    );
  });
});
