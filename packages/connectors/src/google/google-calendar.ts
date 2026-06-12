import type { GoogleAccountConfig } from "../gmail/gmail-auth.js";
import { getValidAccountToken } from "./google-account-token.js";

export type GoogleCalendarEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  location?: string;
  calendarName?: string;
  allDay: boolean;
};

type GoogleEvent = {
  summary?: string;
  location?: string;
  status?: string;
  organizer?: { displayName?: string; email?: string };
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/** Reads upcoming events from Google Calendar for a specific OAuth account. */
export async function getGoogleCalendarEvents(
  account: GoogleAccountConfig,
  days: number,
  calendarId = "primary",
): Promise<GoogleCalendarEvent[]> {
  const token = await getValidAccountToken(account);
  if (!token) {
    throw new Error(`No usable Google token for ${account.email} (${account.tokenPath})`);
  }

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Google Calendar API ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { items?: GoogleEvent[] };
  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map((e) => {
      const allDay = Boolean(e.start?.date && !e.start?.dateTime);
      return {
        title: e.summary ?? "(no title)",
        startsAt: e.start?.dateTime ?? e.start?.date ?? "",
        endsAt: e.end?.dateTime ?? e.end?.date ?? "",
        location: e.location,
        calendarName: e.organizer?.displayName ?? e.organizer?.email ?? account.email,
        allDay,
      };
    });
}
