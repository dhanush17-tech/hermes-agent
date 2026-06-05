import type { ToolResult } from "@hermes-os/shared";
import { assessBrowserAction, type BrowserActionDescriptor, type RiskAssessment } from "./risk-interceptor.js";

export type BrowserWorkbenchOptions = {
  headless?: boolean;
};

export class BrowserWorkbench {
  private session: { browser: unknown; page: unknown } | null = null;

  constructor(private readonly options: BrowserWorkbenchOptions = {}) {}

  async assess(action: BrowserActionDescriptor): Promise<RiskAssessment> {
    return assessBrowserAction(action);
  }

  async open(url: string): Promise<ToolResult> {
    try {
      const pw = await import("playwright");
      if (!this.session) {
        const browser = await pw.chromium.launch({ headless: this.options.headless ?? true });
        const page = await browser.newPage();
        this.session = { browser, page };
      }
      const page = this.session.page as { goto: (u: string) => Promise<void> };
      await page.goto(url);
      return { status: "success", data: { url, method: "playwright" } };
    } catch {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)("open", [url]);
      return { status: "success", data: { url, method: "macos_open" } };
    }
  }

  async click(descriptor: BrowserActionDescriptor): Promise<ToolResult> {
    const assessment = await this.assess(descriptor);
    if (assessment.risky) {
      return {
        status: "denied",
        reason: `Approval required before browser action: ${assessment.reason} [requiresApproval]`,
      };
    }

    if (!this.session) {
      return { status: "denied", reason: "No browser session — call browser.goto first" };
    }

    try {
      const page = this.session.page as {
        click: (sel: string) => Promise<void>;
        locator: (sel: string) => { click: () => Promise<void> };
      };
      const sel = descriptor.selector ?? descriptor.label;
      if (!sel) return { status: "denied", reason: "selector or label required" };
      await page.locator(sel).click();
      return { status: "success", data: { clicked: sel, assessment } };
    } catch (err) {
      return {
        status: "denied",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async extractText(): Promise<ToolResult> {
    if (!this.session) return { status: "denied", reason: "No browser session" };
    try {
      const page = this.session.page as { content: () => Promise<string> };
      const html = await page.content();
      return { status: "success", data: { text: html.slice(0, 20_000) } };
    } catch (err) {
      return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    if (!this.session) return;
    try {
      const browser = this.session.browser as { close: () => Promise<void> };
      await browser.close();
    } catch {
      /* ignore */
    }
    this.session = null;
  }
}

let defaultWorkbench: BrowserWorkbench | null = null;

export function getBrowserWorkbench(): BrowserWorkbench {
  if (!defaultWorkbench) defaultWorkbench = new BrowserWorkbench();
  return defaultWorkbench;
}
