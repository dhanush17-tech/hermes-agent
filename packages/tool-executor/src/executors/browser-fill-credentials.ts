import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "@hermes-os/shared";
import { getBrowserSessionManager } from "@hermes-os/browser-control";
import { getDefaultBrowserApp } from "../default-browser.js";

const execFileAsync = promisify(execFile);

export type BrowserFillCredentialsPayload = {
  username?: string;
  password?: string;
  app?: string;
  submit?: boolean;
  flow?: "same_page" | "multi_step";
};

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function executeBrowserFillCredentials(
  payload: unknown,
): Promise<ToolResult> {
  const body = payload as BrowserFillCredentialsPayload;
  const username = body.username?.trim();
  const password = body.password?.trim();
  if (!username || !password) {
    return { status: "denied", reason: "username and password required" };
  }

  if (process.platform !== "darwin") {
    return { status: "denied", reason: "browser.fill_credentials requires macOS" };
  }

  const app = body.app?.trim() || getDefaultBrowserApp();
  const submit = body.submit !== false;
  const flow = body.flow ?? "same_page";

  const manager = getBrowserSessionManager();
  if (manager.activePage) {
    try {
      const result = await manager.fillCredentials({
        username,
        password,
        flow,
        submit,
      });
      return {
        status: "success",
        data: { filled: true, method: "playwright", flow, ...result },
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (!/No active page|Could not find/i.test(reason)) {
        return { status: "denied", reason };
      }
      // Fall through to macOS UI automation when no Playwright form is available.
    }
  }

  const keystrokes =
    flow === "multi_step"
      ? `
    keystroke "${escapeForAppleScript(username)}"
    ${submit ? "keystroke return" : "keystroke tab"}
    delay 2.4
    keystroke "${escapeForAppleScript(password)}"
    ${submit ? 'delay 0.2\n    keystroke return' : ""}
`
      : `
    keystroke "${escapeForAppleScript(username)}"
    keystroke tab
    delay 0.15
    keystroke "${escapeForAppleScript(password)}"
    ${submit ? 'delay 0.2\n    keystroke return' : ""}
`;

  const script = `
tell application "${escapeForAppleScript(app)}" to activate
delay 0.4
tell application "System Events"
  tell process "${escapeForAppleScript(app)}"
    set frontmost to true
${keystrokes}
  end tell
end tell
`;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 20_000 });
    return {
      status: "success",
      data: { filled: true, app, submitted: submit, flow },
    };
  } catch (err) {
    return {
      status: "denied",
      reason:
        err instanceof Error ?
          `${err.message} (Playwright had no fillable active login page; grant Accessibility for Terminal/Cursor and Automation for Arc if using Arc fallback)`
        : String(err),
    };
  }
}
