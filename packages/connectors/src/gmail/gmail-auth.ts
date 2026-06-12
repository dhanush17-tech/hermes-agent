import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";

export type GoogleAccountConfig = {
  id: string;
  email: string;
  tokenPath: string;
};

export function loadGoogleAccountsFromEnv(): GoogleAccountConfig[] {
  const raw = process.env.GOOGLE_ACCOUNTS?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as GoogleAccountConfig[];
      return parsed.map((a) => ({
        ...a,
        tokenPath: expandPath(a.tokenPath),
      }));
    } catch {
      /* fall through */
    }
  }
  return [];
}

export function expandPath(p: string): string {
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

function legacyOAuthTokenPath(): string | null {
  const path = process.env.GOOGLE_OAUTH_TOKEN_PATH?.trim();
  if (!path) return null;
  const resolved = expandPath(path);
  return existsSync(resolved) ? resolved : null;
}

/** Per-account token file, falling back to GOOGLE_OAUTH_TOKEN_PATH when missing. */
export function resolveAccountTokenPath(account: GoogleAccountConfig): string {
  const configured = expandPath(account.tokenPath);
  if (existsSync(configured)) return configured;
  return legacyOAuthTokenPath() ?? configured;
}

export function extractGmailSearchQuery(text: string): string {
  const fromMatch = text.match(/\bfrom\s+([\w.+-]+(?:@[\w.-]+\.\w+)?)/i);
  if (fromMatch?.[1]) return `from:${fromMatch[1]}`;
  if (/\b(unread|new)\b/i.test(text)) return "is:unread newer_than:7d";
  if (
    /\b(latest|recent|all)\b.*\b(emails?|inbox|mail)\b/i.test(text) ||
    /\b(emails?|inbox|mail)\b.*\b(latest|recent|all)\b/i.test(text)
  ) {
    return "newer_than:7d";
  }
  return "newer_than:3d";
}

export async function readAccountToken(tokenPath: string): Promise<string | null> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    const data = JSON.parse(raw) as { access_token?: string; token?: string };
    return data.access_token ?? data.token ?? null;
  } catch {
    return null;
  }
}

export function resolveAccountByEmail(
  accounts: GoogleAccountConfig[],
  emailHint: string,
): GoogleAccountConfig | null {
  const hint = emailHint.toLowerCase().trim();
  const exact = accounts.find((a) => a.email.toLowerCase() === hint);
  if (exact) return exact;
  const byId = accounts.find((a) => a.id.toLowerCase() === hint);
  if (byId) return byId;
  if (hint.includes("@")) return null;
  return accounts.find((a) => hint.includes(a.email.split("@")[0] ?? "")) ?? null;
}

export function extractGmailAccountHint(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return match?.[0] ?? null;
}

export function wantsBrowserGmail(text: string): boolean {
  return (
    /\b(open|launch|show|use)\b.*\b(gmail|mail)\b.*\b(browser|arc|playwright|chromium)\b/i.test(text) ||
    /\b(browser|arc|playwright)\b.*\b(gmail|mail)\b/i.test(text) ||
    /\bopen\s+gmail\s+in\s+(the\s+)?browser\b/i.test(text)
  );
}

export function isGmailCheckIntent(text: string): boolean {
  if (wantsBrowserGmail(text)) return false;
  return (
    /\b(check|read|summarize|scan|review|log\s*on\s*to|show|list|get|see|fetch)\b.*\b(gmail|emails?|inbox|mail)\b/i.test(
      text,
    ) ||
    /\b(check|read|summarize|scan|review)\b.*@[\w.-]+\.\w+/i.test(text) ||
    /\b(gmail|emails?|inbox|mail)\b.*\b(check|read|summarize|unread|latest|recent|new|all)\b/i.test(text) ||
    /\b(latest|recent|new|all)\b.*\b(gmail|emails?|inbox|mail)\b/i.test(text) ||
    /\blog\s*on\s*to\b.*@[\w.-]+\.\w+/i.test(text)
  );
}
