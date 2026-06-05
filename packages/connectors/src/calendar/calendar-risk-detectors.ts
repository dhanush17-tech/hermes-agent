import type { CalendarEvent, CalendarRisk } from "./types.js";

function parseEventTime(isoOrApple: string): number {
  const t = Date.parse(isoOrApple);
  return Number.isFinite(t) ? t : Date.now();
}

export function detectCalendarConflicts(events: CalendarEvent[]): CalendarRisk[] {
  const risks: CalendarRisk[] = [];
  const sorted = [...events].sort(
    (a, b) => parseEventTime(a.startsAt) - parseEventTime(b.startsAt),
  );

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    const currentEnd = parseEventTime(current.endsAt ?? current.startsAt) + 30 * 60_000;
    const nextStart = parseEventTime(next.startsAt);
    if (nextStart < currentEnd) {
      risks.push({
        category: "calendar",
        title: "Calendar conflict",
        description: `"${current.title}" overlaps with "${next.title}"`,
        score: 75,
      });
    }
  }

  let backToBack = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap =
      parseEventTime(sorted[i + 1]!.startsAt) -
      parseEventTime(sorted[i]!.endsAt ?? sorted[i]!.startsAt);
    if (gap >= 0 && gap < 15 * 60_000) backToBack += 1;
  }
  if (backToBack >= 3) {
    risks.push({
      category: "calendar",
      title: "Heavy meeting load",
      description: `${backToBack + 1} back-to-back meetings with minimal breaks`,
      score: 55,
    });
  }

  return risks;
}

export function detectMeetingsWithoutPrep(events: CalendarEvent[]): CalendarRisk[] {
  const risks: CalendarRisk[] = [];
  const now = Date.now();
  const in72h = now + 72 * 60 * 60 * 1000;

  for (const event of events) {
    const start = parseEventTime(event.startsAt);
    if (start < now || start > in72h) continue;
    const important =
      /investor|board|aws|demo|interview|partner|keynote/i.test(event.title) ||
      /investor|board|aws|demo|interview|partner|keynote/i.test(event.calendarName ?? "");
    if (important) {
      risks.push({
        category: "calendar",
        title: "Meeting may need prep",
        description: `"${event.title}" in next 72h — no prep block detected`,
        score: 65,
      });
    }
  }

  return risks;
}
