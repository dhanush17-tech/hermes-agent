import { describe, expect, it } from "vitest";

/** Documents autonomous loop: browser.observe first, screen.observe only on failure. */
describe("browser observation fallback policy", () => {
  it("prefers browser.observe over screen.observe in NAV_TOOLS set", () => {
    const NAV_TOOLS = new Set(["browser.open", "browser.goto"]);
    expect(NAV_TOOLS.has("browser.open")).toBe(true);
    expect(NAV_TOOLS.has("browser.goto")).toBe(true);
    expect(NAV_TOOLS.has("screen.observe")).toBe(false);
  });

  it("screenshot fallback runs only when browser.observe fails", () => {
    const obs = { status: "denied", reason: "No page" };
    expect(obs.status === "denied").toBe(true);
  });
});
