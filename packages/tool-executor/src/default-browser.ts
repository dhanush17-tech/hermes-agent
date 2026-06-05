/** Primary browser on macOS (opened via `open -a`). */
export function getDefaultBrowserApp(): string {
  return process.env.HERMES_DEFAULT_BROWSER?.trim() || "Arc";
}

export function browserGotoPayload(url: string, app?: string): { url: string; app: string } {
  return { url, app: app?.trim() || getDefaultBrowserApp() };
}
