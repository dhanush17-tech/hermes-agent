import { describe, expect, it } from "vitest";
import { isSocialContentAdviceQuery, isTwitterFeedCheckQuery } from "./social-content-service.js";

describe("social-content-service", () => {
  it("detects twitter post advice", () => {
    expect(isSocialContentAdviceQuery("What should I post next on Twitter?")).toBe(true);
  });

  it("detects check twitter feed", () => {
    expect(isTwitterFeedCheckQuery("Check my Twitter and tell me what I should post next.")).toBe(true);
  });
});
