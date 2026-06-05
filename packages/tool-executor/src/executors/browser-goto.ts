import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "@hermes-os/shared";
import { getDefaultBrowserApp } from "../default-browser.js";
import { executeBrowserOpen } from "./browser-control.js";

const execFileAsync = promisify(execFile);

export type BrowserGotoPayload = {
  url?: string;
  app?: string;
};

/** Playwright unless HERMES_BROWSER_ENGINE=arc */
export function usePlaywrightBrowser(): boolean {
  const engine = process.env.HERMES_BROWSER_ENGINE?.trim().toLowerCase();
  return engine !== "arc";
}

export async function executeBrowserGoto(payload: unknown): Promise<ToolResult> {
  const body = payload as BrowserGotoPayload;
  const url = body.url?.trim();

  if (url && usePlaywrightBrowser()) {
    return executeBrowserOpen({ url, profile: "default" });
  }

  const app = body.app?.trim() || getDefaultBrowserApp();

  if (!url && !app) {
    return { status: "denied", reason: "url or app required" };
  }

  if (process.platform !== "darwin") {
    if (url) {
      try {
        const parsed = new URL(url);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          return { status: "denied", reason: "only http(s) urls" };
        }
      } catch {
        return { status: "denied", reason: "invalid url" };
      }
    }
    return { status: "denied", reason: "browser.goto on macOS uses the open command" };
  }

  try {
    if (url) {
      const parsed = new URL(url);
      if (!["http:", "https:", "calshow:"].includes(parsed.protocol)) {
        return { status: "denied", reason: "unsupported url protocol" };
      }
      await execFileAsync("open", ["-a", app, url], { timeout: 10_000 });
      return { status: "success", data: { opened: url, app, method: "arc" } };
    }

    await execFileAsync("open", ["-a", app], { timeout: 10_000 });
    return { status: "success", data: { openedApp: app, method: "arc" } };
  } catch (err) {
    return {
      status: "denied",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
