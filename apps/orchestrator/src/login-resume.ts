/** User wants to proceed after a browser login pause. */
export const LOGIN_RESUME_OPEN_RE =
  /\b(go ahead|goa ahead|yeah|yes|yep|ok|okay|sure|continue|resume|retry|try again|try agan|proceed|ready|open arc|use arc)\b/i;

/** User finished signing in manually. */
export const LOGIN_RESUME_DONE_RE =
  /\b(done|finished|logged in|i(?:'m| am) in|signed in|login complete|all set)\b/i;

export function isLoginResumeMessage(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 200) return false;
  return LOGIN_RESUME_OPEN_RE.test(t) || LOGIN_RESUME_DONE_RE.test(t);
}

export function loginResumeInstructions(email: string, browser: string): string {
  return [
    `Gmail sign-in needed for ${email}.`,
    "",
    "No approval command is required — this is not a blocked action.",
    "",
    "Do this:",
    `1. I'll open ${browser === "arc" ? "Arc" : "Playwright"} to Gmail.`,
    "2. Sign in manually in that browser window.",
    "3. Reply **done** when you're logged in and I'll continue the inbox check.",
    "",
    "Shortcut replies: **go ahead** (open browser) · **done** (I'm logged in) · **continue inbox**",
  ].join("\n");
}
