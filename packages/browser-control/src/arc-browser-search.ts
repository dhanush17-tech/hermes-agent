import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  executeJavaScriptInHermesTab,
  getHermesActiveTabUrl,
  navigateHermesActiveTab,
  openTabInHermesWindow,
  singleWindowModeEnabled,
} from "./arc-workspace.js";

const execFileAsync = promisify(execFile);

function getDefaultBrowserApp(): string {
  return process.env.HERMES_DEFAULT_BROWSER?.trim() || "Arc";
}

export type ArcSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const LINK_EXTRACT_SCRIPT = `JSON.stringify(
  Array.from(document.querySelectorAll('a[href]'))
    .filter(a => a.href.startsWith('http'))
    .slice(0, 40)
    .map(a => ({
      title: (a.innerText || a.textContent || a.getAttribute('aria-label') || a.href).trim().slice(0, 160),
      url: a.href,
      snippet: (a.closest('div')?.innerText || a.innerText || '').trim().slice(0, 240),
    }))
)`;

const PAGE_TEXT_SCRIPT = `(document.body?.innerText || '').slice(0, 8000)`;

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.slice(0, 200))}`;
}

function isBlockedSearchUrl(url: string): boolean {
  return /google\.com\/search|bing\.com\/search|duckduckgo\.com/i.test(url);
}

function parseJsResult(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export class ArcBrowserSearch {
  private readonly app: string;
  private readonly pageLoadMs: number;

  constructor(options?: { app?: string; pageLoadMs?: number }) {
    this.app = options?.app ?? getDefaultBrowserApp();
    this.pageLoadMs = options?.pageLoadMs ?? (process.env.VITEST === "true" ? 0 : 2800);
  }

  /** Open a URL in the Hermes Arc window (new tab in same window — never spawns extra windows). */
  async openUrl(url: string): Promise<void> {
    if (singleWindowModeEnabled() && this.app === "Arc") {
      await openTabInHermesWindow(url);
      return;
    }
    if (process.platform !== "darwin") {
      await execFileAsync("open", [url], { timeout: 10_000 });
      return;
    }
    await openTabInHermesWindow(url);
  }

  async getActiveTabUrl(): Promise<string | null> {
    if (process.platform !== "darwin" || this.app !== "Arc") return null;
    if (singleWindowModeEnabled()) {
      return getHermesActiveTabUrl();
    }
    try {
      const script = `
        tell application "Arc"
          set t to URL of active tab of front window
          return t
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 8_000 });
      const url = stdout.trim();
      return url.startsWith("http") ? url : null;
    } catch {
      return null;
    }
  }

  async executeJavaScriptInActiveTab(script: string): Promise<string> {
    if (process.platform !== "darwin") {
      throw new Error("Arc JavaScript extraction requires macOS");
    }

    if (singleWindowModeEnabled() && this.app === "Arc") {
      try {
        return await executeJavaScriptInHermesTab(script);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/-1723|Access not allowed/i.test(msg)) {
          throw new Error(
            `Could not execute JavaScript in ${this.app} — enable "Allow JavaScript from Apple Events" in Arc → View → Developer`,
          );
        }
        throw new Error(`Could not execute JavaScript in ${this.app}: ${msg.slice(0, 160)}`);
      }
    }

    const escaped = escapeForAppleScript(script);
    const arcScript = `
      tell application "Arc"
        tell front window
          tell active tab
            set jsResult to execute javascript "${escaped}"
            return jsResult
          end tell
        end tell
      end tell
    `;

    try {
      const { stdout } = await execFileAsync("osascript", ["-e", arcScript], { timeout: 15_000 });
      return stdout.trim();
    } catch {
      throw new Error(
        `Could not execute JavaScript in ${this.app} — enable "Allow JavaScript from Apple Events" in browser settings`,
      );
    }
  }

  async extractLinksFromActiveTab(): Promise<ArcSearchHit[]> {
    const raw = await this.executeJavaScriptInActiveTab(LINK_EXTRACT_SCRIPT);
    const parsed = parseJsResult(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is { title?: string; url?: string; snippet?: string } => Boolean(item && typeof item === "object"))
      .filter((item) => item.url?.startsWith("http"))
      .map((item) => ({
        title: item.title?.trim() || item.url!,
        url: item.url!,
        snippet: item.snippet?.trim() || "",
      }));
  }

  async extractPageText(): Promise<string> {
    const raw = await this.executeJavaScriptInActiveTab(PAGE_TEXT_SCRIPT);
    return raw.trim();
  }

  /** Navigate the active tab in-place (no new tab) — use for Gmail account switches. */
  async navigateActiveTab(url: string): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    const jsUrl = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
      const raw = await this.executeJavaScriptInActiveTab(`window.location.assign("${jsUrl}"); "ok"`);
      return raw.includes("ok");
    } catch {
      return false;
    }
  }

  /** Navigate active tab to URL when possible — avoids opening duplicate tabs for each search. */
  private async navigateToUrl(url: string): Promise<void> {
    if (singleWindowModeEnabled() && this.app === "Arc") {
      const ok = await navigateHermesActiveTab(url);
      if (ok) return;
    }
    const ok = await this.navigateActiveTab(url);
    if (ok) return;
    await this.openUrl(url);
  }

  /** Single search: open Google in Arc, read results from the live tab. */
  async search(query: string, limit = 8): Promise<ArcSearchHit[]> {
    const url = buildSearchUrl(query);
    await this.navigateToUrl(url);
    if (this.pageLoadMs > 0) {
      await new Promise((r) => setTimeout(r, this.pageLoadMs));
    }

    try {
      const links = await this.extractLinksFromActiveTab();
      return links
        .filter((l) => !isBlockedSearchUrl(l.url))
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  /** Open a product/page URL in Arc and return visible text + links. */
  async fetchPageInArc(url: string): Promise<{ url: string; text: string; links: ArcSearchHit[] }> {
    await this.navigateToUrl(url);
    if (this.pageLoadMs > 0) {
      await new Promise((r) => setTimeout(r, this.pageLoadMs));
    }
    const activeUrl = (await this.getActiveTabUrl()) ?? url;
    try {
      const [text, links] = await Promise.all([
        this.extractPageText().catch(() => ""),
        this.extractLinksFromActiveTab().catch(() => []),
      ]);
      return { url: activeUrl, text, links };
    } catch {
      return { url: activeUrl, text: "", links: [] };
    }
  }
}

export const arcBrowserSearch = new ArcBrowserSearch();
