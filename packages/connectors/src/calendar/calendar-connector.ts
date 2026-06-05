import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Connector, ConnectorScanResult } from "../types.js";
import type { CalendarConnectorPort, CalendarEvent, CalendarRisk } from "./types.js";
import { detectCalendarConflicts, detectMeetingsWithoutPrep } from "./calendar-risk-detectors.js";

const execFileAsync = promisify(execFile);

export class MacCalendarConnector implements CalendarConnectorPort, Connector {
  readonly name = "calendar";

  async getToday(): Promise<CalendarEvent[]> {
    return this.fetchEvents(0, 1);
  }

  async getUpcoming(days: number): Promise<CalendarEvent[]> {
    return this.fetchEvents(0, days);
  }

  async detectConflicts(): Promise<CalendarRisk[]> {
    const events = await this.getUpcoming(2);
    return detectCalendarConflicts(events);
  }

  async detectMeetingsWithoutPrep(): Promise<CalendarRisk[]> {
    const events = await this.getUpcoming(3);
    return detectMeetingsWithoutPrep(events);
  }

  async scan(): Promise<ConnectorScanResult> {
    if (process.platform !== "darwin") {
      return { connector: this.name, items: [], error: "Calendar ingest is macOS-only" };
    }
    try {
      const events = await this.getUpcoming(2);
      const items: ConnectorScanResult["items"] = events.map((e) => ({
        sourceType: "calendar",
        externalId: `calendar:${e.id}`,
        title: e.title,
        content: `${e.startsAt}${e.location ? ` @ ${e.location}` : ""}`,
        metadata: JSON.stringify({
          platform: "macos-calendar",
          method: "local_db",
          calendarName: e.calendarName,
        }),
      }));
      return { connector: this.name, items };
    } catch (err) {
      return {
        connector: this.name,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async fetchEvents(startDays: number, spanDays: number): Promise<CalendarEvent[]> {
    if (process.platform !== "darwin") return [];

    const script = `
      set out to ""
      tell application "Calendar"
        set startDate to (current date) + (${startDays} * days)
        set endDate to startDate + (${spanDays} * days)
        repeat with cal in calendars
          set calName to name of cal
          set evts to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
          repeat with e in evts
            set out to out & (calName) & tab & (summary of e) & tab & (start date of e as string) & tab & (end date of e as string) & linefeed
          end repeat
        end repeat
      end tell
      return out
    `;

    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 30_000,
      maxBuffer: 512 * 1024,
    });

    const events: CalendarEvent[] = [];
    for (const line of stdout.split("\n").filter(Boolean)) {
      const [calName, title, startsAt, endsAt] = line.split("\t");
      if (!title?.trim()) continue;
      const key = `${calName}:${title}:${startsAt}`;
      events.push({
        id: Buffer.from(key).toString("base64url").slice(0, 32),
        title: title.trim(),
        startsAt: startsAt?.trim() ?? "",
        endsAt: endsAt?.trim(),
        calendarName: calName?.trim(),
      });
    }
    return events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }
}

/** @deprecated use MacCalendarConnector */
export { MacCalendarConnector as CalendarConnector };
