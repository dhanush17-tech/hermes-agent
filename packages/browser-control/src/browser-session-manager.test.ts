import { describe, expect, it, vi, beforeEach } from "vitest";
import { BrowserSessionManager } from "./browser-session-manager.js";
import { SelectorStore } from "./selector-store.js";
import type { InteractiveElement } from "./types.js";

function seedElements(store: SelectorStore, pageId: string): InteractiveElement[] {
  const elements: InteractiveElement[] = [
    {
      ref: "el_001",
      tag: "button",
      name: "Next",
      selector: "button.next",
      visible: true,
      risk: "none",
    },
    {
      ref: "el_send",
      tag: "button",
      name: "Send",
      text: "Send",
      selector: "button.send",
      visible: true,
      risk: "high",
    },
    {
      ref: "el_input",
      tag: "input",
      name: "Subject",
      type: "text",
      selector: 'input[name="subject"]',
      visible: true,
      risk: "none",
    },
    {
      ref: "el_email",
      tag: "input",
      name: "Email",
      type: "email",
      selector: 'input[type="email"]',
      visible: true,
      risk: "medium",
    },
    {
      ref: "el_password",
      tag: "input",
      name: "Password",
      type: "password",
      selector: 'input[type="password"]',
      visible: true,
      risk: "high",
    },
  ];
  store.setPageElements(pageId, elements);
  return elements;
}

describe("BrowserSessionManager", () => {
  let manager: BrowserSessionManager;
  let clickMock: ReturnType<typeof vi.fn>;
  let fillMock: ReturnType<typeof vi.fn>;
  let pressMock: ReturnType<typeof vi.fn>;
  let elements: InteractiveElement[];

  beforeEach(() => {
    manager = new BrowserSessionManager();
    clickMock = vi.fn().mockResolvedValue(undefined);
    fillMock = vi.fn().mockResolvedValue(undefined);
    pressMock = vi.fn().mockResolvedValue(undefined);

    const driver = (manager as unknown as { driver: Record<string, unknown> }).driver;
    driver.click = clickMock;
    driver.fill = fillMock;
    driver.press = pressMock;
    driver.listPages = vi.fn().mockReturnValue([
      { id: "p1", sessionId: "s1", url: "https://example.com", title: "Test" },
    ]);

    elements = seedElements((manager as unknown as { selectors: SelectorStore }).selectors, "p1");
    (manager as unknown as { activePageId: string }).activePageId = "p1";
  });

  it("click refuses Send without approval", async () => {
    await expect(manager.click("p1", "el_send", false)).rejects.toMatchObject({
      code: "APPROVAL_REQUIRED",
    });
    expect(clickMock).not.toHaveBeenCalled();
  });

  it("click allows low-risk button", async () => {
    const result = await manager.click("p1", "el_001", false);
    expect(result.assessment.requiresApproval).toBe(false);
    expect(clickMock).toHaveBeenCalledWith("p1", "button.next");
  });

  it("fill fills input field", async () => {
    await manager.fill("p1", "el_input", "Hello subject", false);
    expect(fillMock).toHaveBeenCalledWith("p1", 'input[name="subject"]', "Hello subject");
  });

  it("fills credentials in the active Playwright page", async () => {
    const observation = {
      pageId: "p1",
      url: "https://accounts.google.com",
      title: "Sign in",
      visibleText: "",
      interactive: elements,
      forms: [],
      links: [],
      consoleErrors: [],
      networkState: "idle" as const,
    };
    vi.spyOn(manager, "observe").mockResolvedValue(observation);

    const result = await manager.fillCredentials({
      username: "people@devlabs.club",
      password: "secret",
      submit: true,
    });

    expect(result.usernameRef).toBe("el_email");
    expect(result.passwordRef).toBe("el_password");
    expect(fillMock).toHaveBeenCalledWith("p1", 'input[type="email"]', "people@devlabs.club");
    expect(fillMock).toHaveBeenCalledWith("p1", 'input[type="password"]', "secret");
    expect(pressMock).toHaveBeenCalledWith("p1", 'input[type="password"]', "Enter");
  });
});
