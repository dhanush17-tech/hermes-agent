const PAGE_TEXT_MARKER = "--- page text ---";

/** Strip the instruction prefix from browser.extract output. */
export function pageTextFromBrowserExtract(full: string): string {
  const idx = full.indexOf(PAGE_TEXT_MARKER);
  return idx >= 0 ? full.slice(idx + PAGE_TEXT_MARKER.length).trim() : full.trim();
}

/** True when the visible page is a Google sign-in screen, not an inbox. */
export function looksLikeGmailLoginPage(pageText: string): boolean {
  const t = pageText.trim();
  if (!t) return true;

  const lower = t.toLowerCase();

  if (/\blogin_required\b/i.test(t)) return true;
  if (lower.includes("sign in with google")) return true;
  if (lower.includes("email or phone") && lower.includes("forgot email")) return true;
  if (lower.includes("choose an account")) return true;
  if (lower.includes("couldn't sign you in") || lower.includes("could not sign you in")) return true;
  if (/^sign in$/im.test(t) && lower.includes("google account")) return true;

  const inboxSignals =
    /\binbox\b/i.test(t) ||
    /\bcompose\b/i.test(t) ||
    /\bprimary\b/i.test(t) ||
    /\bunread\b/i.test(t) ||
    /\bstarred\b/i.test(t) ||
    /\bsent\b/i.test(t) ||
    (/@/.test(t) && /\b(subject|re:|fwd:)\b/i.test(t));

  if (inboxSignals) return false;

  if (lower.includes("accounts.google.com") && !inboxSignals) return true;

  return false;
}

export function looksLikeGmailLoginExtract(fullExtract: string): boolean {
  return looksLikeGmailLoginPage(pageTextFromBrowserExtract(fullExtract));
}
