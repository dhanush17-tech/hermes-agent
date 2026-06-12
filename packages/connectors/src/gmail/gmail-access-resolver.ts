import {
  extractGmailAccountHint,
  loadGoogleAccountsFromEnv,
  resolveAccountByEmail,
  type GoogleAccountConfig,
} from "./gmail-auth.js";
import { testGmailApiAccess, tokenForAccountWithRefresh } from "./gmail-token.js";

export type GmailAccessMode =
  | "api"
  | "browser_logged_in"
  | "browser_login_required"
  | "oauth_required"
  | "unavailable";

export type GmailAccessResolution = {
  mode: GmailAccessMode;
  accountId?: string;
  email: string;
  reason: string;
  preferredBrowser?: "arc" | "playwright";
};

export type ResolveGmailAccessInput = {
  email?: string;
  text?: string;
  preferredBrowser?: "arc" | "playwright";
  checkBrowserSession?: (email: string, browser: "arc" | "playwright") => Promise<boolean>;
};

function resolveAccount(emailHint: string | null, accounts: GoogleAccountConfig[]): GoogleAccountConfig | null {
  if (emailHint) return resolveAccountByEmail(accounts, emailHint);
  return accounts[0] ?? null;
}

export function preferredBrowserFromEnv(): "arc" | "playwright" {
  return process.env.HERMES_PREFERRED_BROWSER?.toLowerCase() === "playwright" ? "playwright" : "arc";
}

export async function resolveGmailAccess(input: ResolveGmailAccessInput = {}): Promise<GmailAccessResolution> {
  const accounts = loadGoogleAccountsFromEnv();
  const emailHint = input.email ?? (input.text ? extractGmailAccountHint(input.text) : null);
  const preferredBrowser = input.preferredBrowser ?? preferredBrowserFromEnv();
  const account = emailHint ? resolveAccountByEmail(accounts, emailHint) : accounts[0] ?? null;
  const resolvedEmail = emailHint ?? account?.email ?? "unknown";

  if (!account) {
    if (emailHint) {
      return {
        mode: "browser_login_required",
        email: resolvedEmail,
        reason: `No Gmail API account configured for ${emailHint}; browser login may still work`,
        preferredBrowser,
      };
    }
    return {
      mode: "unavailable",
      email: resolvedEmail,
      reason: "No Gmail accounts configured. Set GOOGLE_ACCOUNTS in .env.",
      preferredBrowser,
    };
  }

  const { token, refreshMissing } = await tokenForAccountWithRefresh(accounts, account.id);
  if (!token) {
    return {
      mode: refreshMissing ? "oauth_required" : "oauth_required",
      accountId: account.id,
      email: resolvedEmail,
      reason: "Gmail API token missing or unreadable",
      preferredBrowser,
    };
  }

  const apiTest = await testGmailApiAccess(token);
  if (apiTest.ok) {
    return {
      mode: "api",
      accountId: account.id,
      email: account.email,
      reason: "Gmail API authorized",
      preferredBrowser,
    };
  }

  if (apiTest.reason === "oauth_required") {
    const browser = input.checkBrowserSession
      ? await input.checkBrowserSession(account.email, preferredBrowser)
      : false;
    if (browser) {
      return {
        mode: "browser_logged_in",
        accountId: account.id,
        email: account.email,
        reason: `Gmail API not authorized; ${preferredBrowser} session logged in`,
        preferredBrowser,
      };
    }
    return {
      mode: "oauth_required",
      accountId: account.id,
      email: account.email,
      reason: "Gmail API token expired or unauthorized",
      preferredBrowser,
    };
  }

  const browserLoggedIn = input.checkBrowserSession
    ? await input.checkBrowserSession(account.email, preferredBrowser)
    : false;

  if (browserLoggedIn) {
    return {
      mode: "browser_logged_in",
      accountId: account.id,
      email: account.email,
      reason: `Gmail API unavailable; ${preferredBrowser} session logged in`,
      preferredBrowser,
    };
  }

  return {
    mode: "browser_login_required",
    accountId: account.id,
    email: account.email,
    reason: `Gmail API unavailable and ${preferredBrowser} not logged into ${account.email}`,
    preferredBrowser,
  };
}
