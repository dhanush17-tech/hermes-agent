import { homedir } from "node:os";
import { join } from "node:path";
import { generateId } from "@hermes-os/shared";
import type { BrowserPage, BrowserSession } from "./types.js";
import { BrowserControlError } from "./errors.js";

type PlaywrightPage = {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  url: () => string;
  title: () => Promise<string>;
  click: (selector: string, opts?: { timeout?: number }) => Promise<void>;
  fill: (selector: string, value: string) => Promise<void>;
  press: (selector: string, key: string) => Promise<void>;
  selectOption: (selector: string, value: string) => Promise<void>;
  evaluate: <T>(fn: string | ((arg: unknown) => T), arg?: unknown) => Promise<T>;
  screenshot: (opts?: { path?: string; fullPage?: boolean }) => Promise<Buffer>;
  close: () => Promise<void>;
  isClosed: () => boolean;
};

type PlaywrightContext = {
  newPage: () => Promise<PlaywrightPage>;
  pages: () => PlaywrightPage[];
  close: () => Promise<void>;
};

type PlaywrightBrowser = {
  newContext: (opts?: Record<string, unknown>) => Promise<PlaywrightContext>;
  close: () => Promise<void>;
};

export class PlaywrightDriver {
  private browser: PlaywrightBrowser | null = null;
  private context: PlaywrightContext | null = null;
  private readonly pages = new Map<string, PlaywrightPage>();
  private readonly pageMeta = new Map<string, BrowserPage>();

  async launchPersistentProfile(profileName: string): Promise<BrowserSession> {
    const pw = await this.loadPlaywright();
    const userDataDir = join(homedir(), ".hermes", "browser-profiles", profileName);
    const context = await pw.chromium.launchPersistentContext(userDataDir, {
      headless: process.env.HERMES_BROWSER_HEADLESS === "1",
      viewport: { width: 1280, height: 900 },
    });
    this.context = context as unknown as PlaywrightContext;
    const now = new Date().toISOString();
    return {
      id: generateId("bsess"),
      profileName,
      createdAt: now,
      lastUsedAt: now,
    };
  }

  async connectToCDP(endpoint = process.env.HERMES_CDP_ENDPOINT ?? "http://127.0.0.1:9222"): Promise<BrowserSession> {
    const pw = await this.loadPlaywright();
    const browser = await pw.chromium.connectOverCDP(endpoint);
    const cdpBrowser = browser as {
      contexts: () => PlaywrightContext[];
      newContext: () => Promise<PlaywrightContext>;
    };
    this.browser = cdpBrowser as unknown as PlaywrightBrowser;
    const contexts = cdpBrowser.contexts();
    this.context = contexts[0] ?? (await cdpBrowser.newContext());
    const now = new Date().toISOString();
    return {
      id: generateId("bsess"),
      profileName: "cdp",
      createdAt: now,
      lastUsedAt: now,
    };
  }

  async ensureContext(profileName = "default"): Promise<void> {
    if (this.context) return;
    if (process.env.HERMES_CDP_ENDPOINT || process.env.HERMES_USE_CDP === "1") {
      await this.connectToCDP();
      return;
    }
    await this.launchPersistentProfile(profileName);
  }

  async openPage(sessionId: string, url: string): Promise<BrowserPage> {
    await this.ensureContext();
    if (!this.context) throw new BrowserControlError("No browser context", "NO_SESSION");

    const page = await this.context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const pageId = generateId("bpage");
    this.pages.set(pageId, page);
    const meta: BrowserPage = {
      id: pageId,
      sessionId,
      url: page.url(),
      title: await page.title(),
    };
    this.pageMeta.set(pageId, meta);
    return meta;
  }

  getPage(pageId: string): PlaywrightPage | null {
    const page = this.pages.get(pageId);
    if (!page || page.isClosed()) return null;
    return page;
  }

  listPages(): BrowserPage[] {
    return [...this.pageMeta.values()];
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page && !page.isClosed()) await page.close();
    this.pages.delete(pageId);
    this.pageMeta.delete(pageId);
  }

  async click(pageId: string, selector: string): Promise<void> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    await page.click(selector, { timeout: 10_000 });
  }

  async fill(pageId: string, selector: string, value: string): Promise<void> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    await page.fill(selector, value);
  }

  async press(pageId: string, selector: string, key: string): Promise<void> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    await page.press(selector, key);
  }

  async select(pageId: string, selector: string, value: string): Promise<void> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    await page.selectOption(selector, value);
  }

  async extractText(pageId: string): Promise<string> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    return page.evaluate("document.body?.innerText ?? ''");
  }

  async evaluateSafe<T>(pageId: string, fn: string): Promise<T> {
    if (/\b(localStorage|sessionStorage|cookie)\b/i.test(fn)) {
      throw new BrowserControlError("Forbidden script pattern", "ACTION_DENIED");
    }
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    return page.evaluate(fn);
  }

  async screenshot(pageId: string): Promise<Buffer> {
    const page = this.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");
    return page.screenshot({ fullPage: false });
  }

  /** Raw Playwright page for Stagehand / CDP integrations. */
  getPlaywrightPage(pageId: string): PlaywrightPage | null {
    return this.getPage(pageId);
  }

  private async loadPlaywright(): Promise<{
    chromium: {
      launchPersistentContext: (path: string, opts: Record<string, unknown>) => Promise<unknown>;
      connectOverCDP: (endpoint: string) => Promise<unknown>;
    };
  }> {
    try {
      const pw = await import("playwright");
      return pw as {
        chromium: {
          launchPersistentContext: (path: string, opts: Record<string, unknown>) => Promise<unknown>;
          connectOverCDP: (endpoint: string) => Promise<unknown>;
        };
      };
    } catch {
      throw new BrowserControlError("Playwright not installed", "PLAYWRIGHT_UNAVAILABLE");
    }
  }
}
