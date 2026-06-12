import { arcBrowserSearch } from "./arc-browser-search.js";
import {
  executeJavaScriptInHermesTab,
  executeJavaScriptInTab,
  findTabByUrlFragment,
  findTabForUrl,
  focusTab,
  navigateTabInPlace,
  openTabInHermesWindow,
  singleWindowModeEnabled,
  type ArcTabRef,
} from "./arc-workspace.js";
import { checkBrowserStuck, clearBrowserStuck } from "./browser-stuck-guard.js";
import { isGmailHost } from "./gmail-browser-url.js";
import type { ExpectedPageService } from "./page-content-validator.js";
import { validatePageContent } from "./page-content-validator.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function urlMatchesHost(url: string, hostFragment: string): boolean {
  try {
    return new URL(url).host.includes(hostFragment);
  } catch {
    return url.includes(hostFragment);
  }
}

export async function waitForActiveTabUrl(
  matcher: (url: string) => boolean,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<string | null> {
  const timeoutMs = opts?.timeoutMs ?? 4_000;
  const intervalMs = opts?.intervalMs ?? 300;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = await arcBrowserSearch.getActiveTabUrl();
    if (url && matcher(url)) return url;
    await sleep(intervalMs);
  }
  return null;
}

export async function focusArcTabContaining(urlFragment: string): Promise<ArcTabRef | null> {
  const found = await findTabByUrlFragment(urlFragment);
  if (!found) return null;
  await focusTab(found);
  return found;
}

export type ArcFetchResult = {
  url: string;
  text: string;
  valid: boolean;
  reason?: string;
  suggestion?: string;
  retries: number;
};

export type ArcFetchOptions = {
  retries?: number;
  pageLoadMs?: number;
  stuckKey?: string;
  /** After first Gmail open, navigate in-tab instead of opening new tabs. */
  gmailSessionActive?: boolean;
  /** Feed watch: only use existing tabs — never open new ones. */
  reuseOnly?: boolean;
};

async function extractPageTextFromTab(tabRef?: ArcTabRef | null): Promise<string> {
  const script = `(document.documentElement?.innerText || document.body?.innerText || '').slice(0, 8000)`;
  if (tabRef) return executeJavaScriptInTab(tabRef, script);
  if (singleWindowModeEnabled()) return executeJavaScriptInHermesTab(script);
  return arcBrowserSearch.extractPageText();
}

function classifyArcExtractError(err: unknown): { reason: string; suggestion: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (/-1723|Access not allowed/i.test(msg)) {
    return {
      reason: "arc_js_disabled",
      suggestion:
        'Enable Arc → View → Developer → "Allow JavaScript from Apple Events", quit Arc fully (Cmd+Q), reopen, then retry.',
    };
  }
  if (/timed out|ETIMEDOUT|TIMEOUT/i.test(msg)) {
    return {
      reason: "arc_tab_js_timeout",
      suggestion: "Arc hung reading that tab. Click the tab once in Arc, then retry.",
    };
  }
  if (/-10006|-1719|Can't get|Can't set|Invalid index/i.test(msg)) {
    return {
      reason: "arc_tab_unreachable",
      suggestion: "Hermes could not focus that Arc tab. Open it manually, then retry.",
    };
  }
  return {
    reason: "arc_js_failed",
    suggestion: `Arc page read failed: ${msg.slice(0, 160)}`,
  };
}

async function tryExtractAndValidate(
  expected: ExpectedPageService,
  activeUrl: string,
  tabRef?: ArcTabRef | null,
): Promise<ArcFetchResult> {
  let text = "";
  try {
    text = await extractPageTextFromTab(tabRef);
  } catch (err) {
    const classified = classifyArcExtractError(err);
    return {
      url: activeUrl,
      text: "",
      valid: false,
      reason: classified.reason,
      suggestion: classified.suggestion,
      retries: 0,
    };
  }

  if (text.trim().length < 40 && isGmailHost(activeUrl) && expected === "gmail") {
    await sleep(800);
    try {
      text = await extractPageTextFromTab(tabRef);
    } catch {
      /* keep short text */
    }
  }

  const validation = validatePageContent(expected, text, activeUrl);
  if (validation.ok) {
    return { url: activeUrl, text, valid: true, retries: 0 };
  }

  return {
    url: activeUrl,
    text,
    valid: false,
    reason: validation.reason,
    suggestion: validation.suggestion,
    retries: 0,
  };
}

function finishWithStuckGuard(
  result: ArcFetchResult,
  stuckKey?: string,
): ArcFetchResult {
  if (!stuckKey) return result;
  if (result.valid) {
    clearBrowserStuck(stuckKey);
    return result;
  }
  const reason = result.reason ?? "unknown";
  const stuck = checkBrowserStuck(stuckKey, reason);
  if (stuck.stuck) {
    return {
      ...result,
      reason: "stuck_loop",
      suggestion: stuck.healAction,
    };
  }
  return result;
}

/** Read a page from Arc — extract-first, navigate in-tab, open new tab only once. */
export async function fetchArcPageValidated(
  url: string,
  expected: ExpectedPageService,
  opts?: ArcFetchOptions,
): Promise<ArcFetchResult> {
  const hostFragment = hostFragmentFor(url, expected);
  const loadMs = opts?.pageLoadMs ?? arcPageLoadMs();
  const gmailSession = opts?.gmailSessionActive ?? false;

  const existingTab = await findTabForUrl(url);
  if (existingTab) {
    await focusTab(existingTab);
    const current = await tryExtractAndValidate(expected, existingTab.url, existingTab);
    if (current.valid) return finishWithStuckGuard(current, opts?.stuckKey);

    if (!opts?.reuseOnly && existingTab.url !== url) {
      await navigateTabInPlace(existingTab, url);
      if (loadMs > 0) await sleep(Math.min(loadMs, 1200));
      const afterNav = await tryExtractAndValidate(expected, url, existingTab);
      if (afterNav.valid) return finishWithStuckGuard(afterNav, opts?.stuckKey);
      if (gmailSession) return finishWithStuckGuard(afterNav, opts?.stuckKey);
    }
    if (opts?.reuseOnly || gmailSession) {
      return finishWithStuckGuard(current, opts?.stuckKey);
    }
  }

  if (opts?.reuseOnly) {
    const fail: ArcFetchResult = {
      url,
      text: "",
      valid: false,
      reason: "tab_not_found",
      suggestion: `No open tab for ${hostFragment} — open it in Arc first, or ask Hermes to open the page.`,
      retries: 0,
    };
    return finishWithStuckGuard(fail, opts?.stuckKey);
  }

  let activeUrl: string | null = null;
  try {
    activeUrl = await arcBrowserSearch.getActiveTabUrl();
  } catch {
    activeUrl = null;
  }
  if (activeUrl && urlMatchesHost(activeUrl, hostFragment)) {
    const current = await tryExtractAndValidate(expected, activeUrl);
    if (current.valid) return finishWithStuckGuard(current, opts?.stuckKey);

    if (!opts?.reuseOnly) {
      const navigated = await arcBrowserSearch.navigateActiveTab(url);
      if (navigated) {
        if (loadMs > 0) await sleep(Math.min(loadMs, 1200));
        const afterNav = await tryExtractAndValidate(
          expected,
          (await arcBrowserSearch.getActiveTabUrl()) ?? url,
        );
        if (afterNav.valid) return finishWithStuckGuard(afterNav, opts?.stuckKey);
        if (gmailSession) return finishWithStuckGuard(afterNav, opts?.stuckKey);
      }
    }
  }

  const focused = await focusArcTabContaining(hostFragment);
  if (focused) {
    if (focused.url !== url) {
      await navigateTabInPlace(focused, url);
      if (loadMs > 0) await sleep(Math.min(loadMs, 1200));
    }
    const fromFocus = await tryExtractAndValidate(expected, focused.url, focused);
    if (fromFocus.valid) return finishWithStuckGuard(fromFocus, opts?.stuckKey);
    if (gmailSession) return finishWithStuckGuard(fromFocus, opts?.stuckKey);
  }

  if (gmailSession) {
    const fail: ArcFetchResult = {
      url: activeUrl ?? url,
      text: "",
      valid: false,
      reason: "gmail_tab_unreachable",
      suggestion: "Focus your Gmail tab in Arc, then reply **continue routine**.",
      retries: 0,
    };
    return finishWithStuckGuard(fail, opts?.stuckKey);
  }

  if (singleWindowModeEnabled()) {
    await openTabInHermesWindow(url);
  } else {
    await arcBrowserSearch.openUrl(url);
  }
  if (loadMs > 0) await sleep(loadMs);
  const openedUrl =
    (await waitForActiveTabUrl((u) => urlMatchesHost(u, hostFragment), { timeoutMs: 5_000 })) ??
    (await arcBrowserSearch.getActiveTabUrl()) ??
    url;

  const opened = await tryExtractAndValidate(expected, openedUrl);
  return finishWithStuckGuard(opened, opts?.stuckKey);
}

function hostFragmentFor(url: string, expected: ExpectedPageService): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    const defaults: Record<ExpectedPageService, string> = {
      gmail: "mail.google.com",
      calendar: "calendar.google.com",
      canvas: "canvas.asu.edu",
      twitter: "x.com",
      linkedin: "linkedin.com",
      generic: "",
    };
    return defaults[expected];
  }
}

function arcPageLoadMs(): number {
  if (process.env.VITEST === "true") return 0;
  const raw = process.env.HERMES_ARC_PAGE_LOAD_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 1_200;
}
