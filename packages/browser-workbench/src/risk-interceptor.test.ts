import { describe, expect, it } from "vitest";
import { assessBrowserAction } from "./risk-interceptor.js";

describe("browser risk interceptor", () => {
  it("flags submit actions", () => {
    const a = assessBrowserAction({ kind: "submit", label: "Submit registration" });
    expect(a.risky).toBe(true);
  });

  it("allows benign navigation", () => {
    const a = assessBrowserAction({ kind: "navigate", url: "https://example.com/docs" });
    expect(a.risky).toBe(false);
  });
});
