import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const RECORD_SEP = "|||";
const MAX_ELEMENTS = 80;

export type DesktopUiElement = {
  ref: string;
  index: number;
  role: string;
  name: string;
  value: string;
  focused: boolean;
  actions: Array<"click" | "type" | "focus">;
};

export type DesktopObservation = {
  app: string;
  window: string;
  focusedRef: string | null;
  elements: DesktopUiElement[];
  /** Compact text for planner — mirrors browser.observe formatting */
  formatted: string;
  observedAt: string;
};

const SCAN_SCRIPT = (target: string, maxEls: number) => `
tell application "System Events"
  tell ${target}
    try
      set value of attribute "AXManualAccessibility" to true
    end try
    set appName to name
    set winName to ""
    try
      set winName to name of front window
    end try
    set scanOut to "META" & "${RECORD_SEP}" & appName & "${RECORD_SEP}" & winName & linefeed
    try
      set els to entire contents of front window
      set lim to ${maxEls}
      if (count of els) < lim then set lim to (count of els)
      repeat with i from 1 to lim
        try
          set e to item i of els
          set c to class of e as text
          set elRole to ""
          if c contains "text field" or c contains "text area" or c contains "combo box" then
            set elRole to "input"
          else if c contains "button" then
            set elRole to "button"
          else if c contains "static text" then
            set elRole to "text"
          else if c contains "menu item" then
            set elRole to "menuitem"
          else if c contains "checkbox" then
            set elRole to "checkbox"
          else if c contains "radio button" then
            set elRole to "radio"
          else if c contains "pop up button" then
            set elRole to "popup"
          else if c contains "list" then
            set elRole to "list"
          else
            set elRole to "other"
          end if
          set nm to ""
          set val to ""
          set foc to "0"
          try
            set vv to value of e
            if vv is not missing value then set val to vv as text
          end try
          try
            set vv to name of e
            if vv is not missing value then set nm to vv as text
          end try
          if nm is "" then
            try
              set vv to description of e
              if vv is not missing value then set nm to vv as text
            end try
          end if
          if val is "missing value" then set val to ""
          if nm is "missing value" then set nm to ""
          try
            if focused of e then set foc to "1"
          end try
          if elRole is not "other" and (nm is not "" or val is not "") then
            set scanOut to scanOut & (i as text) & "${RECORD_SEP}" & elRole & "${RECORD_SEP}" & nm & "${RECORD_SEP}" & val & "${RECORD_SEP}" & foc & linefeed
          end if
        end try
      end repeat
    end try
    return scanOut
  end tell
end tell
`;

function actionsForRole(role: string): DesktopUiElement["actions"] {
  switch (role) {
    case "input":
      return ["type", "focus", "click"];
    case "button":
    case "menuitem":
    case "checkbox":
    case "radio":
    case "popup":
      return ["click", "focus"];
    default:
      return ["focus"];
  }
}

/** @internal exported for tests */
export function parseDesktopScanOutput(raw: string): DesktopObservation {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let app = "unknown";
  let window = "";
  const elements: DesktopUiElement[] = [];

  for (const line of lines) {
    const parts = line.split(RECORD_SEP);
    if (parts[0] === "META") {
      app = parts[1] ?? app;
      window = parts[2] ?? window;
      continue;
    }
    const index = Number(parts[0]);
    if (!Number.isFinite(index) || index < 1) continue;
    const role = parts[1] ?? "other";
    const name = parts[2] ?? "";
    const value = parts[3] ?? "";
    const focused = parts[4] === "1";
    const label = (value || name).slice(0, 160);
    if (!label) continue;

    elements.push({
      ref: `ax_${String(index).padStart(3, "0")}`,
      index,
      role,
      name: name.slice(0, 160),
      value: value.slice(0, 300),
      focused,
      actions: actionsForRole(role),
    });
  }

  const focusedRef = elements.find((e) => e.focused)?.ref ?? null;
  const interactive = elements.filter((e) => e.role !== "text" || e.value.length > 0);

  const formatted = [
    `App: ${app} | Window: ${window || "(unknown)"}`,
    focusedRef ? `Focused ref: ${focusedRef}` : "Focused ref: (none detected)",
    `Interactive elements (${interactive.length}) — use desktop.act with ref, not blind keyboard:`,
    ...interactive.slice(0, 40).map((e) => {
      const val = e.value && e.value !== e.name ? ` value="${e.value.slice(0, 80)}"` : "";
      return `  ${e.ref} [${e.role}] ${e.name || e.value}${val} | actions=${e.actions.join(",")}`;
    }),
    ...elements
      .filter((e) => e.role === "text" && e.value.length > 8)
      .slice(0, 15)
      .map((e) => `  ${e.ref} [text] ${e.value.slice(0, 120)}`),
  ].join("\n");

  return {
    app,
    window,
    focusedRef,
    elements,
    formatted,
    observedAt: new Date().toISOString(),
  };
}

export async function scanDesktopUi(app?: string): Promise<DesktopObservation> {
  const target = app
    ? `process "${app.replace(/"/g, '\\"')}"`
    : `(first application process whose frontmost is true)`;

  const { stdout } = await execFileAsync(
    "osascript",
    ["-e", SCAN_SCRIPT(target, MAX_ELEMENTS)],
    { timeout: 25_000 },
  );
  return parseDesktopScanOutput(stdout);
}

function refToIndex(ref: string): number | null {
  const m = /^ax_(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  return Number(m[1]);
}

const actSchema = z.object({
  ref: z.string().min(1),
  action: z.enum(["click", "focus", "type", "press"]),
  text: z.string().optional(),
  key: z.string().optional(),
  app: z.string().optional(),
});

export async function actOnDesktopRef(
  payload: unknown,
  pressKey: (key: string, modifiers: string[] | undefined, app?: string) => Promise<void>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: string }> {
  const body = actSchema.safeParse(payload);
  if (!body.success) {
    return {
      ok: false,
      reason: 'desktop.act needs { "ref": "ax_003", "action": "click"|"type"|"focus"|"press", "text"?: "...", "app"?: "Slack" }',
    };
  }

  const index = refToIndex(body.data.ref);
  if (!index) {
    return { ok: false, reason: `Invalid ref ${body.data.ref} — re-run desktop.observe_app first` };
  }

  const target = body.data.app
    ? `process "${body.data.app.replace(/"/g, '\\"')}"`
    : `(first application process whose frontmost is true)`;

  const escapedText = (body.data.text ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  if (body.data.action === "press") {
    if (!body.data.key) return { ok: false, reason: "desktop.act press requires key" };
    try {
      await pressKey(body.data.key, undefined, body.data.app);
      return { ok: true, data: { ref: body.data.ref, action: "press", key: body.data.key } };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  const script =
    body.data.action === "click"
      ? `
tell application "System Events"
  tell ${target}
    try
      set value of attribute "AXManualAccessibility" to true
    end try
    set e to item ${index} of (entire contents of front window)
    click e
    return "ok"
  end tell
end tell
`
      : body.data.action === "focus"
        ? `
tell application "System Events"
  tell ${target}
    try
      set value of attribute "AXManualAccessibility" to true
    end try
    set e to item ${index} of (entire contents of front window)
    set focused of e to true
    return "ok"
  end tell
end tell
`
        : `
tell application "System Events"
  tell ${target}
    try
      set value of attribute "AXManualAccessibility" to true
    end try
    set e to item ${index} of (entire contents of front window)
    set focused of e to true
    delay 0.15
    try
      set value of e to "${escapedText}"
      return "set_value"
    on error
      keystroke "a" using command down
      delay 0.05
      keystroke "${escapedText}"
      return "keystroke"
    end try
  end tell
end tell
`;

  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: 20_000 });
    return {
      ok: true,
      data: {
        ref: body.data.ref,
        action: body.data.action,
        method: stdout.trim(),
        text: body.data.text?.slice(0, 80),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not allowed|assistive|1002|-1743|-25211/i.test(msg)) {
      return {
        ok: false,
        reason:
          "Accessibility permission required — System Settings → Privacy → Accessibility",
      };
    }
    return { ok: false, reason: msg.slice(0, 400) };
  }
}

/** Detect planner loops (same desktop.press repeated). */
export function desktopActionFingerprint(tool: string, payload: unknown): string {
  return `${tool}:${JSON.stringify(payload ?? {})}`;
}

export function isDesktopUiStuck(recentFingerprints: string[]): boolean {
  if (recentFingerprints.length < 3) return false;
  const last3 = recentFingerprints.slice(-3);
  return last3.every((f) => f === last3[0]) && last3[0]!.includes("desktop.");
}
