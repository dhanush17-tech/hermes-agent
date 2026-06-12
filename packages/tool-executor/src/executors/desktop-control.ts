import { homedir } from "node:os";
import { resolve, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ToolResult } from "@hermes-os/shared";
import { isDestructiveTerminalCommand } from "@hermes-os/policies";
import { analyzeScreenForContext } from "../screen-context.js";
import { actOnDesktopRef, scanDesktopUi } from "./desktop-accessibility.js";
import { executeScreenObserve } from "./screen-observe.js";

const execFileAsync = promisify(execFile);

export function isDesktopControlEnabled(): boolean {
  if (process.env.VITEST === "true") return false;
  if (process.env.HERMES_DISABLE_DESKTOP_CONTROL === "1") return false;
  if (process.env.HERMES_ENABLE_DESKTOP_CONTROL === "1") return true;
  return process.platform === "darwin";
}

function requireMac(): ToolResult | null {
  if (process.platform !== "darwin") {
    return { status: "denied", reason: "desktop tools require macOS" };
  }
  if (!isDesktopControlEnabled()) {
    return {
      status: "denied",
      reason: "Desktop control disabled — set HERMES_ENABLE_DESKTOP_CONTROL=1 in .env",
    };
  }
  return null;
}

export function resolveDesktopCwd(cwd: string | undefined, fallback: string): string {
  const home = homedir();
  if (!cwd?.trim()) return fallback;
  const raw = cwd.trim();
  if (raw === "~") return home;
  if (raw.startsWith("~/")) return resolve(home, raw.slice(2));
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(fallback, raw);
}

function escapeAppleScript(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

const runCommandSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

export async function executeDesktopRunCommand(
  payload: unknown,
  workspaceRoot: string,
  approvalId?: string,
): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = runCommandSchema.parse(payload);
  const cmd = body.command.trim();
  if (isDestructiveTerminalCommand(cmd) && !approvalId) {
    return {
      status: "denied",
      reason: "[requiresApproval] Destructive or high-risk shell command",
    };
  }

  const cwd = resolveDesktopCwd(body.cwd, homedir());
  try {
    const { stdout, stderr } = await execFileAsync("sh", ["-c", cmd], {
      cwd,
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, HOME: homedir() },
    });
    return {
      status: "success",
      data: { stdout, stderr, cwd, command: cmd, approvalId: approvalId ?? null },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "denied", reason: msg.slice(0, 500) };
  }
}

const openAppSchema = z.object({
  app: z.string().min(1).optional(),
  url: z.string().optional(),
  path: z.string().optional(),
});

export async function executeDesktopOpenApp(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = openAppSchema.parse(payload);
  const args: string[] = [];
  if (body.app) args.push("-a", body.app);
  const target = body.url ?? body.path;
  if (target) args.push(target);

  if (args.length === 0) {
    return { status: "denied", reason: "app, url, or path required" };
  }

  try {
    await execFileAsync("open", args, { timeout: 15_000 });
    return {
      status: "success",
      data: { app: body.app ?? null, target: target ?? null, method: "open" },
    };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}

const observeScreenSchema = z.object({
  analyze: z.boolean().optional(),
  prompt: z.string().optional(),
});

export async function executeDesktopObserveScreen(
  payload: unknown,
  workspaceRoot: string,
): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = observeScreenSchema.parse(payload ?? {});
  const capture = await executeScreenObserve(workspaceRoot);
  if (capture.status !== "success" || !capture.data) return capture;

  const capturePath = (capture.data as { capturePath: string }).capturePath;
  if (body.analyze === false) {
    return {
      status: "success",
      data: {
        capturePath,
        method: "screencapture",
        analyzed: false,
      },
    };
  }

  const analysis = await analyzeScreenForContext(capturePath, "desktop", null);
  return {
    status: "success",
    data: {
      capturePath,
      method: "screencapture+vision",
      analyzed: true,
      summary: analysis.summary,
      openLoops: analysis.openLoops,
      risks: analysis.risks,
      visionDescription: analysis.visionDescription,
    },
  };
}

const typeSchema = z.object({
  text: z.string(),
  app: z.string().optional(),
});

export async function executeDesktopType(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = typeSchema.parse(payload);
  const text = body.text;
  if (!text) return { status: "denied", reason: "text required" };

  const appLine = body.app
    ? `tell application "${escapeAppleScript(body.app)}" to activate\ndelay 0.35\n`
    : "";

  const script = `
${appLine}
tell application "System Events"
  keystroke "${escapeAppleScript(text)}"
end tell
`;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 20_000 });
    return { status: "success", data: { typed: text.length, app: body.app ?? "frontmost" } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|1002|-1743|-25211/i.test(msg)) {
      return {
        status: "denied",
        reason:
          "Accessibility permission required — grant Cursor or Terminal → System Settings → Privacy & Security → Accessibility",
      };
    }
    return { status: "denied", reason: msg };
  }
}

const pressSchema = z.object({
  key: z.string().min(1),
  modifiers: z.array(z.string()).optional(),
  app: z.string().optional(),
});

export type DesktopPressInput = z.infer<typeof pressSchema>;

const MODIFIER_KEYS = new Set(["cmd", "command", "shift", "option", "alt", "ctrl", "control"]);

const MODIFIER_MAP: Record<string, string> = {
  cmd: "command down",
  command: "command down",
  shift: "shift down",
  option: "option down",
  alt: "option down",
  ctrl: "control down",
  control: "control down",
};

/**
 * Special keys MUST be sent as key codes — `keystroke "return"` types the
 * literal word "return" instead of pressing the Return key.
 */
const KEY_CODE_MAP: Record<string, number> = {
  return: 36,
  enter: 36,
  tab: 48,
  space: 49,
  delete: 51,
  backspace: 51,
  escape: 53,
  esc: 53,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
};

export function normalizeDesktopPressInput(
  payload: unknown,
): { ok: true; value: DesktopPressInput } | { ok: false; reason: string } {
  if (!payload || typeof payload !== "object") {
    return {
      ok: false,
      reason: 'use { "key": "k", "modifiers": ["cmd"] } or { "combo": "cmd+k" }',
    };
  }

  const raw = payload as Record<string, unknown>;
  const app = typeof raw.app === "string" ? raw.app : undefined;

  const comboSource =
    typeof raw.combo === "string" ? raw.combo
    : typeof raw.keys === "string" ? raw.keys
    : typeof raw.keyCombo === "string" ? raw.keyCombo
    : typeof raw.key === "string" && raw.key.includes("+") ? raw.key
    : null;

  if (comboSource) {
    const parts = comboSource
      .split("+")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) {
      return { ok: false, reason: `could not parse combo "${comboSource}"` };
    }
    const key = parts[parts.length - 1]!;
    const modifiers = parts.slice(0, -1).filter((m) => MODIFIER_KEYS.has(m));
    return { ok: true, value: { key, modifiers, app } };
  }

  if (Array.isArray(raw.modifiers) && !raw.key) {
    const tokens = raw.modifiers.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
    const nonMods = tokens.filter((t) => !MODIFIER_KEYS.has(t));
    if (nonMods.length === 1) {
      const key = nonMods[0]!;
      const modifiers = tokens.filter((t) => MODIFIER_KEYS.has(t));
      return { ok: true, value: { key, modifiers, app } };
    }
  }

  const parsed = pressSchema.safeParse(payload);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    reason: 'missing "key" — example: { "key": "k", "modifiers": ["cmd"], "app": "Slack" }',
  };
}

export async function executeDesktopPress(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const normalized = normalizeDesktopPressInput(payload);
  if (!normalized.ok) {
    return { status: "denied", reason: `desktop.press: ${normalized.reason}` };
  }
  const body = normalized.value;
  const keyToken = body.key.trim().toLowerCase();
  const keyCode = KEY_CODE_MAP[keyToken];
  const mods = (body.modifiers ?? [])
    .map((m) => MODIFIER_MAP[m.trim().toLowerCase()])
    .filter(Boolean);
  const modClause = mods.length ? ` using {${mods.join(", ")}}` : "";

  const keyLine =
    keyCode !== undefined
      ? `key code ${keyCode}${modClause}`
      : `keystroke "${escapeAppleScript(body.key)}"${modClause}`;

  const appLine = body.app
    ? `tell application "${escapeAppleScript(body.app)}" to activate\ndelay 0.35\n`
    : "";

  const fixedScript = `
${appLine}
tell application "System Events"
  ${keyLine}
end tell
`;

  try {
    await execFileAsync("osascript", ["-e", fixedScript], { timeout: 15_000 });
    return {
      status: "success",
      data: {
        key: keyToken,
        sentAs: keyCode !== undefined ? `key code ${keyCode}` : "keystroke",
        modifiers: body.modifiers ?? [],
        app: body.app ?? "frontmost",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|1002|-1743|-25211/i.test(msg)) {
      return {
        status: "denied",
        reason:
          "Accessibility permission required — grant Cursor or Terminal → System Settings → Privacy & Security → Accessibility",
      };
    }
    return { status: "denied", reason: msg };
  }
}

const clickSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  app: z.string().optional(),
});

export async function executeDesktopClick(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = clickSchema.parse(payload);
  const appLine = body.app
    ? `tell application "${escapeAppleScript(body.app)}" to activate\ndelay 0.35\n`
    : "";

  const script = `
${appLine}
tell application "System Events"
  click at {${body.x}, ${body.y}}
end tell
`;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 15_000 });
    return {
      status: "success",
      data: { x: body.x, y: body.y, app: body.app ?? "screen" },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|1002|-1743|-25211/i.test(msg)) {
      return {
        status: "denied",
        reason:
          "Accessibility permission required — grant Cursor or Terminal → System Settings → Privacy & Security → Accessibility",
      };
    }
    return { status: "denied", reason: msg };
  }
}

const observeAppSchema = z.object({
  app: z.string().optional(),
});

/** Structured accessibility observation with ax_* refs — desktop equivalent of browser.observe. */
export async function executeDesktopObserveApp(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = observeAppSchema.parse(payload ?? {});

  try {
    const observation = await scanDesktopUi(body.app);
    return {
      status: "success",
      data: {
        ui: observation.formatted,
        formatted: observation.formatted,
        observation,
        method: "accessibility_refs",
        elementCount: observation.elements.length,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|1002|-1743|-25211/i.test(msg)) {
      return {
        status: "denied",
        reason:
          "Accessibility permission required — grant Cursor or Terminal → System Settings → Privacy & Security → Accessibility",
      };
    }
    return { status: "denied", reason: msg.slice(0, 400) };
  }
}

export async function executeDesktopAct(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const result = await actOnDesktopRef(payload, async (key, modifiers, app) => {
    const normalized = normalizeDesktopPressInput({ key, modifiers, app });
    if (!normalized.ok) throw new Error(normalized.reason);
    const pressResult = await executeDesktopPress(normalized.value);
    if (pressResult.status === "denied") {
      throw new Error(pressResult.reason ?? "press failed");
    }
    if (pressResult.status !== "success") {
      throw new Error("press failed");
    }
  });

  if (!result.ok) return { status: "denied", reason: result.reason };
  return { status: "success", data: result.data };
}

const listAppsSchema = z.object({
  limit: z.number().int().positive().max(50).optional(),
});

export async function executeDesktopListApps(payload: unknown): Promise<ToolResult> {
  const gate = requireMac();
  if (gate) return gate;

  const body = listAppsSchema.parse(payload ?? {});
  const limit = body.limit ?? 30;
  const script = `
tell application "System Events"
  set out to ""
  set n to 0
  repeat with p in (every application process whose background only is false)
    set out to out & (name of p as text) & linefeed
    set n to n + 1
    if n ≥ ${limit} then exit repeat
  end repeat
  return out
end tell
`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 12_000 });
    const apps = stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return { status: "success", data: { apps, count: apps.length } };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}
