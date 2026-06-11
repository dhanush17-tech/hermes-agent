import type { ToolResult } from "@hermes-os/shared";
import { MacCalendarConnector } from "@hermes-os/connectors";

export type CalendarListPayload = {
  /** How many days ahead to include (1 = today). Clamped to 1..14. */
  days?: number;
};

/** Read upcoming events from the local macOS Calendar. */
export async function executeCalendarList(payload: unknown): Promise<ToolResult> {
  if (process.platform !== "darwin") {
    return { status: "denied", reason: "Calendar access is macOS-only on this machine." };
  }
  const body = (payload ?? {}) as CalendarListPayload;
  const days = Math.min(Math.max(Math.floor(body.days ?? 1), 1), 14);
  const cal = new MacCalendarConnector();
  try {
    const events = await cal.getUpcoming(days);
    return {
      status: "success",
      data: {
        days,
        count: events.length,
        events: events.map((e) => ({
          title: e.title,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          location: e.location,
          calendar: e.calendarName,
        })),
      },
    };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}
