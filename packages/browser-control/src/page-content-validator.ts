export type ExpectedPageService = "gmail" | "calendar" | "canvas" | "twitter" | "linkedin" | "generic";

export type ContentValidation = { ok: true } | { ok: false; reason: string; suggestion?: string };

const WRONG_PAGE_MARKERS: Array<{ re: RegExp; label: string }> = [
  { re: /\bchatgpt\b|\bnew chat\b|\bchat history\b|\bclaude\.ai\b/i, label: "ChatGPT/AI chat" },
  { re: /\bcursor\b.*\bagent\b/i, label: "Cursor IDE" },
  { re: /\bgithub\b.*\brepository\b/i, label: "GitHub" },
];

export function validatePageContent(
  expected: ExpectedPageService,
  text: string,
  url?: string | null,
): ContentValidation {
  const page = text.trim();
  const lower = page.toLowerCase();
  const host = url ? tryHost(url) : "";

  for (const marker of WRONG_PAGE_MARKERS) {
    if (marker.re.test(page)) {
      return {
        ok: false,
        reason: `wrong_page:${marker.label}`,
        suggestion: `Active tab looks like ${marker.label}, not ${expected}. Navigating to the correct URL.`,
      };
    }
  }

  switch (expected) {
    case "gmail": {
      if (
        host &&
        !host.includes("mail.google.com") &&
        !host.includes("accounts.google.com") &&
        !looksLikeGmailContent(page)
      ) {
        return { ok: false, reason: "wrong_url:not_gmail", suggestion: "Open mail.google.com in Arc." };
      }
      const inboxSignals =
        /\b(inbox|compose|primary|promotions|updates|search mail|all mail|starred|gmail)\b/i.test(page) ||
        (host.includes("mail.google.com") && page.length > 80 && !looksLikeGmailLoginPageText(lower));
      if (!inboxSignals && looksLikeGmailLoginPageText(lower)) {
        return { ok: false, reason: "gmail_login_required" };
      }
      if (!inboxSignals && page.length > 200) {
        return {
          ok: false,
          reason: "not_gmail_inbox",
          suggestion: "Gmail inbox not detected — switch Arc to your inbox tab.",
        };
      }
      if (host.includes("mail.google.com") && page.length > 60 && !looksLikeGmailLoginPageText(lower)) {
        return { ok: true };
      }
      return { ok: true };
    }
    case "calendar": {
      if (host && !host.includes("calendar.google.com") && !/\b(calendar|today|week|event|agenda)\b/i.test(page)) {
        return { ok: false, reason: "wrong_url:not_calendar" };
      }
      if (!/\b(calendar|today|week|month|agenda|event)\b/i.test(page) && page.length > 100) {
        return { ok: false, reason: "not_calendar" };
      }
      return { ok: true };
    }
    case "canvas": {
      if (host && !host.includes("canvas") && !/\b(canvas|assignment|course|due|dashboard)\b/i.test(page)) {
        return { ok: false, reason: "wrong_url:not_canvas" };
      }
      return { ok: true };
    }
    case "twitter": {
      if (
        host &&
        !host.includes("x.com") &&
        !host.includes("twitter.com") &&
        !/\b(posts|followers|following|repost|@\w+)/i.test(page)
      ) {
        return { ok: false, reason: "wrong_url:not_twitter" };
      }
      return { ok: true };
    }
    case "linkedin": {
      if (host && !host.includes("linkedin.com") && !/\b(linkedin|feed|network|post)\b/i.test(page)) {
        return { ok: false, reason: "wrong_url:not_linkedin" };
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

function looksLikeGmailContent(page: string): boolean {
  return /\b(inbox|compose|primary|search mail|gmail)\b/i.test(page) && page.length > 60;
}

function looksLikeGmailLoginPageText(lower: string): boolean {
  return (
    lower.includes("sign in with google") ||
    (lower.includes("email or phone") && lower.includes("forgot email")) ||
    lower.includes("choose an account")
  );
}

function tryHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
