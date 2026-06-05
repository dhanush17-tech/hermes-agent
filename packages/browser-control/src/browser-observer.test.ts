import { describe, expect, it, vi } from "vitest";
import { BrowserObserver } from "./browser-observer.js";
import { SelectorStore } from "./selector-store.js";
import type { PlaywrightDriver } from "./playwright-driver.js";

const MOCK_DOM = {
  title: "Test Page",
  url: "https://example.com/test",
  visibleText: "Hello world",
  elements: [
    {
      tag: "button",
      name: "Click me",
      text: "Click me",
      selector: "button:nth-of-type(1)",
      visible: true,
      box: { x: 10, y: 20, width: 100, height: 30 },
    },
    {
      tag: "input",
      name: "Email",
      placeholder: "Email",
      type: "email",
      selector: 'input[name="email"]',
      visible: true,
    },
    {
      tag: "button",
      name: "Send",
      text: "Send",
      selector: "button:nth-of-type(2)",
      visible: true,
    },
  ],
  links: [{ ref: "lnk_001", text: "Home", href: "https://example.com" }],
};

function mockDriver(): PlaywrightDriver {
  return {
    getPage: vi.fn().mockReturnValue({
      evaluate: vi.fn().mockResolvedValue(MOCK_DOM),
    }),
  } as unknown as PlaywrightDriver;
}

describe("BrowserObserver", () => {
  it("returns interactive refs on a test page", async () => {
    const driver = mockDriver();
    const observer = new BrowserObserver(driver, new SelectorStore());
    const obs = await observer.observe("page-1");

    expect(obs.pageId).toBe("page-1");
    expect(obs.interactive.length).toBe(3);
    expect(obs.interactive[0]?.ref).toBe("el_001");
    expect(obs.interactive[1]?.ref).toBe("el_002");
    expect(obs.interactive[2]?.ref).toBe("el_003");
    expect(obs.interactive[2]?.risk).toBe("high");
  });

  it("stores ref to selector mapping", async () => {
    const driver = mockDriver();
    const store = new SelectorStore();
    const observer = new BrowserObserver(driver, store);
    await observer.observe("page-1");

    const el = store.get("page-1", "el_001");
    expect(el?.selector).toBe("button:nth-of-type(1)");
    expect(el?.name).toBe("Click me");
  });
});
