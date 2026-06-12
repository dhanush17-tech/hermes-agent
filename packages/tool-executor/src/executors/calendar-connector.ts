import { existsSync } from "node:fs";
import type { ToolResult } from "@hermes-os/shared";
import { getGoogleCalendarEvents, loadGoogleAccountsFromEnv } from "@hermes-os/connectors";

export type CalendarListPayload = {
  /** How many days ahead to include (1 = today). Clamped to 1..30. */
  days?: number;
  /** Which Google account to read (defaults to the first authenticated one). */
  accountId?: string;
  /** Google calendar id (defaults to the account's primary calendar). */
  calendarId?: string;
};

function resolveAccountId(accountId?: string): string | null {
  if (accountId) return accountId;
  const accounts = loadGoogleAccountsFromEnv();
  const authed = accounts.find((a) => a.tokenPath && existsSync(a.tokenPath));
  return authed?.id ?? accounts[0]?.id ?? null;
}

/** Read upcoming events from Google Calendar via OAuth. */
export async function executeCalendarList(payload: unknown): Promise<ToolResult> {
  const body = (payload ?? {}) as CalendarListPayload;
  const days = Math.min(Math.max(Math.floor(body.days ?? 1), 1), 30);

  const accounts = loadGoogleAccountsFromEnv();
  if (!accounts.length) {
    return { status: "denied", reason: "No Google accounts configured (set GOOGLE_ACCOUNTS)." };
  }
  const accountId = resolveAccountId(body.accountId);
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    return { status: "denied", reason: `Unknown Google account: ${accountId}` };
  }

  try {
    const events = await getGoogleCalendarEvents(account, days, body.calendarId ?? "primary");
    return {
      status: "success",
      data: {
        account: account.email,
        days,
        count: events.length,
        events,
      },
    };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}
