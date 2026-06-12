import { describe, expect, it } from "vitest";
import {
  extractSkinType,
  extractInlineProductPreferences,
  filterCategoryPreferences,
  isIrrelevantProductMemory,
} from "./product-preference-extractor.js";

describe("product-preference-extractor", () => {
  it("detects oily skin in message", () => {
    expect(extractSkinType("I have oily skin I guess")).toBe("oily");
    expect(extractInlineProductPreferences("moisturizer for oily skin", "skincare").preferences).toContain(
      "oily skin",
    );
  });

  it("filters founder-energy memories for skincare", () => {
    expect(isIrrelevantProductMemory("founder-energy vibe")).toBe(true);
    expect(
      filterCategoryPreferences(["founder-energy vibe", "oily skin"], "skincare"),
    ).toEqual(["oily skin"]);
  });
});
