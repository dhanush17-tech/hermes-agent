import type { CalendarEvent } from "./types.js";

export function buildMeetingBrief(events: CalendarEvent[], maxEvents = 5): string {
  const lines = ["Meeting brief", ""];
  if (events.length === 0) {
    lines.push("No upcoming meetings.");
    return lines.join("\n");
  }
  for (const e of events.slice(0, maxEvents)) {
    lines.push(`• ${e.title}`);
    lines.push(`  When: ${e.startsAt}`);
    if (e.location) lines.push(`  Where: ${e.location}`);
    lines.push("");
  }
  return lines.join("\n");
}
