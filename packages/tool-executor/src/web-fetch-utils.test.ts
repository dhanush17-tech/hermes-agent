import { describe, expect, it } from "vitest";
import { normalizeWebFetchPayload } from "./web-fetch-utils.js";

describe("normalizeWebFetchPayload", () => {
  it("accepts url", () => {
    expect(normalizeWebFetchPayload({ url: "https://apple.com/iphone" })).toEqual({
      ok: true,
      url: "https://apple.com/iphone",
    });
  });

  it("maps query to google search url", () => {
    const result = normalizeWebFetchPayload({ query: "iPhone 17 price" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain("google.com/search");
      expect(result.url).toContain("iPhone");
    }
  });

  it("rejects empty payload", () => {
    expect(normalizeWebFetchPayload({}).ok).toBe(false);
  });
});
