import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  clearArcWorkspaceStateFile,
  isArcRecoverableError,
  registerArcHealState,
} from "./arc-self-heal.js";

const execFileAsync = promisify(execFile);

type WorkspaceState = {
  windowIndex: number;
  updatedAt: string;
};

let cachedWindowIndex: number | null = null;

function workspaceStatePath(root?: string): string {
  const base = root ?? process.env.HERMES_OS_ROOT ?? process.cwd();
  return resolve(base, "data/hermes-arc-window.json");
}

export function singleWindowModeEnabled(): boolean {
  if (process.env.VITEST === "true") return false;
  if (process.env.HERMES_ARC_SINGLE_WINDOW === "0") return false;
  return process.env.HERMES_ARC_SINGLE_WINDOW === "1" || process.platform === "darwin";
}

async function runArcScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 12_000 });
  return (stdout ?? "").trim();
}

async function runArcScriptSafe(script: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const idx = await loadWindowIndex();
      if (idx) await validateWindowIndex(idx);
      return await runArcScript(script);
    } catch (err) {
      if (attempt === 0 && isArcRecoverableError(err)) {
        await resetHermesArcWindow();
        await reconcileHermesWindowIndex();
        continue;
      }
      throw err;
    }
  }
  throw new Error("Arc script failed after self-heal retry");
}

export async function validateWindowIndex(index: number): Promise<number> {
  if (process.platform !== "darwin") return index;
  const count = Number(
    await runArcScript(`tell application "Arc" to count of windows`).catch(() => "1"),
  );
  if (!Number.isFinite(count) || count < 1) {
    return ensureHermesWindow();
  }
  if (index > count) {
    await saveWindowIndex(count);
    return count;
  }
  return index;
}

export async function reconcileHermesWindowIndex(): Promise<number> {
  if (process.platform !== "darwin") return 1;
  const count = Number(
    await runArcScript(`tell application "Arc" to count of windows`).catch(() => "1"),
  );
  const windowIndex = Math.max(1, Number.isFinite(count) ? count : 1);
  await saveWindowIndex(windowIndex);
  return windowIndex;
}

export async function resetHermesArcWindow(): Promise<void> {
  cachedWindowIndex = null;
  await clearArcWorkspaceStateFile(workspaceStatePath());
}

/** @internal for arc-self-heal */
export async function loadWindowIndexForHeal(): Promise<number | null> {
  return loadWindowIndex();
}

registerArcHealState({
  resetWindow: resetHermesArcWindow,
  reconcileWindow: reconcileHermesWindowIndex,
  validateWindow: validateWindowIndex,
});

async function loadWindowIndex(): Promise<number | null> {
  if (cachedWindowIndex) return cachedWindowIndex;
  try {
    const raw = await readFile(workspaceStatePath(), "utf8");
    const data = JSON.parse(raw) as WorkspaceState;
    if (data.windowIndex >= 1) {
      cachedWindowIndex = data.windowIndex;
      return cachedWindowIndex;
    }
  } catch {
    /* no state yet */
  }
  return null;
}

async function saveWindowIndex(index: number): Promise<void> {
  cachedWindowIndex = index;
  const path = workspaceStatePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ windowIndex: index, updatedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

/** One dedicated Arc window for Hermes — avoids spawning extra windows via `open -a Arc`. */
export async function ensureHermesWindow(): Promise<number> {
  if (process.platform !== "darwin") return 1;

  const existing = await loadWindowIndex();
  if (existing) {
    const alive = await runArcScriptSafe(`
      tell application "Arc"
        return (count of windows) >= ${existing}
      end tell
    `);
    if (alive === "true") return existing;
  }

  try {
    const count = await runArcScriptSafe(`
      tell application "Arc"
        make new window
        return count of windows
      end tell
    `);
    const index = Number(count);
    const windowIndex = Number.isFinite(index) && index >= 1 ? index : 1;
    await saveWindowIndex(windowIndex);
    return windowIndex;
  } catch {
    const fallback = await runArcScriptSafe(`tell application "Arc" to count of windows`).catch(() => "1");
    const windowIndex = Math.max(1, Number(fallback) || 1);
    await saveWindowIndex(windowIndex);
    return windowIndex;
  }
}

export type ArcTabRef = {
  windowIndex: number;
  tabIndex: number;
  url: string;
};

/** Prefer exact account/path match (e.g. Gmail authuser) before generic host. */
export async function findTabForUrl(targetUrl: string): Promise<ArcTabRef | null> {
  try {
    const u = new URL(targetUrl);
    if (u.host.includes("mail.google.com")) {
      const authuser = u.searchParams.get("authuser");
      if (authuser) {
        const candidates = [
          `authuser=${encodeURIComponent(authuser)}`,
          `authuser=${authuser}`,
          encodeURIComponent(authuser),
          authuser,
        ];
        for (const frag of candidates) {
          const hit = await findTabByUrlFragment(frag);
          if (hit) return hit;
        }
        const generic = await findTabByUrlFragment("mail.google.com");
        if (generic) return generic;
        return null;
      }
    }
    const host = u.host.replace(/^www\./, "");
    const byHost = await findTabByUrlFragment(host);
    if (byHost) return byHost;
    if (host.includes("canvas")) {
      return (await findTabByUrlFragment("canvas.asu.edu")) ?? (await findTabByUrlFragment("canvas"));
    }
    return null;
  } catch {
    return findTabByUrlFragment(targetUrl);
  }
}

export async function findTabByUrlFragment(fragment: string): Promise<ArcTabRef | null> {
  if (process.platform !== "darwin" || !fragment) return null;
  const escaped = fragment.replace(/"/g, '\\"');
  const out = await runArcScriptSafe(`
    tell application "Arc"
      set wi to 1
      repeat with w in windows
        set ti to 1
        repeat with t in tabs of w
          set tabUrl to URL of t
          if tabUrl contains "${escaped}" then
            return (wi as text) & "," & (ti as text) & "," & tabUrl
          end if
          set ti to ti + 1
        end repeat
        set wi to wi + 1
      end repeat
      return ""
    end tell
  `).catch(() => "");

  if (!out.includes(",")) return null;
  const [wi, ti, ...rest] = out.split(",");
  const url = rest.join(",");
  const windowIndex = Number(wi);
  const tabIndex = Number(ti);
  if (!Number.isFinite(windowIndex) || !Number.isFinite(tabIndex) || !url.startsWith("http")) {
    return null;
  }
  return { windowIndex, tabIndex, url };
}

/** Focus a tab without calling `activate` on Arc (keeps user workflow calmer). */
export async function focusTab(ref: ArcTabRef): Promise<void> {
  if (process.platform !== "darwin") return;
  const windowIndex = await validateWindowIndex(ref.windowIndex);
  await runArcScriptSafe(`
    tell application "Arc"
      select tab ${ref.tabIndex} of window ${windowIndex}
    end tell
  `).catch(() => undefined);
}

/** Open URL as a new tab in the Hermes window only (never `open -a Arc`). */
export async function openTabInHermesWindow(url: string): Promise<void> {
  if (process.platform !== "darwin") {
    await execFileAsync("open", [url], { timeout: 10_000 });
    return;
  }

  const windowIndex = await ensureHermesWindow();
  const escaped = url.replace(/"/g, '\\"');
  const validWindow = await validateWindowIndex(windowIndex);
  await runArcScriptSafe(`
    tell application "Arc"
      tell window ${validWindow}
        make new tab with properties {URL:"${escaped}"}
        select tab (count of tabs)
      end tell
    end tell
  `);
}

/** Navigate the active tab inside the Hermes window (in-place, no new tab). */
export async function navigateTabInPlace(ref: ArcTabRef, url: string): Promise<boolean> {
  const jsUrl = url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    const out = await executeJavaScriptInTab(ref, `window.location.assign("${jsUrl}"); "ok"`);
    return out.includes("ok");
  } catch {
    return false;
  }
}

export async function navigateHermesActiveTab(url: string): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const windowIndex = await ensureHermesWindow();
  const escaped = url.replace(/"/g, '\\"');
  try {
    const validWindow = await validateWindowIndex(windowIndex);
    const out = await runArcScriptSafe(`
      tell application "Arc"
        tell window ${validWindow}
          set URL of active tab to "${escaped}"
          return URL of active tab
        end tell
      end tell
    `);
    return out.includes(new URL(url).host);
  } catch {
    return false;
  }
}

export async function getHermesActiveTabUrl(): Promise<string | null> {
  if (process.platform !== "darwin") return null;
  const windowIndex = await loadWindowIndex();
  if (!windowIndex) return null;
  try {
    const validWindow = await validateWindowIndex(windowIndex);
    const url = await runArcScriptSafe(`
      tell application "Arc"
        tell window ${validWindow}
          return URL of active tab
        end tell
      end tell
    `);
    return url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export async function executeJavaScriptInTab(ref: ArcTabRef, script: string): Promise<string> {
  await focusTab(ref);
  const windowIndex = await validateWindowIndex(ref.windowIndex);
  const escaped = script.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        "osascript",
        [
          "-e",
          `
          tell application "Arc"
            tell window ${windowIndex}
              tell active tab
                return execute javascript "${escaped}"
              end tell
            end tell
          end tell
        `,
        ],
        { timeout: 15_000 },
      );
      return stdout.trim();
    } catch (err) {
      if (attempt === 0 && isArcRecoverableError(err)) {
        await resetHermesArcWindow();
        await reconcileHermesWindowIndex();
        continue;
      }
      throw err;
    }
  }
  throw new Error("Arc JS execution failed after self-heal");
}

export async function executeJavaScriptInHermesTab(script: string): Promise<string> {
  let windowIndex = await loadWindowIndex();
  if (!windowIndex) windowIndex = await ensureHermesWindow();
  windowIndex = await validateWindowIndex(windowIndex);
  const escaped = script.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        "osascript",
        [
          "-e",
          `
          tell application "Arc"
            tell window ${windowIndex}
              tell active tab
                return execute javascript "${escaped}"
              end tell
            end tell
          end tell
        `,
        ],
        { timeout: 15_000 },
      );
      return stdout.trim();
    } catch (err) {
      if (attempt === 0 && isArcRecoverableError(err)) {
        windowIndex = await reconcileHermesWindowIndex();
        continue;
      }
      throw err;
    }
  }
  throw new Error("Hermes Arc JS failed after self-heal");
}
