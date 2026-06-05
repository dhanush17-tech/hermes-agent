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
  return (
    accounts.find((a) => a.email.toLowerCase() === hint) ??
    accounts.find((a) => hint.includes(a.email.split("@")[0] ?? "")) ??
    accounts.find((a) => a.id.toLowerCase() === hint) ??
    null
  );
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
    /\b(check|read|summarize|scan|review|log\s*on\s*to)\b.*\b(gmail|email|inbox|mail)\b/i.test(text) ||
    /\b(gmail|email|inbox)\b.*\b(check|read|summarize|unread)\b/i.test(text) ||
    /\blog\s*on\s*to\b.*@[\w.-]+\.\w+/i.test(text)
  );
}
