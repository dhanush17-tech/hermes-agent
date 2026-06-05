import type { DetectedRisk, RiskScanInput } from "../types.js";
import { buildRisk, parseCalendarEventsFromSources } from "./shared.js";

type CalEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  calendarName?: string;
};

function parseEventTime(isoOrApple: string): number {
  const t = Date.parse(isoOrApple);
  return Number.isFinite(t) ? t : Date.now();
}

function detectCalendarConflicts(events: CalEvent[]): Array<{ description: string; title: string; score: number }> {
  const risks: Array<{ description: string; title: string; score: number }> = [];
  const sorted = [...events].sort((a, b) => parseEventTime(a.startsAt) - parseEventTime(b.startsAt));

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const next = sorted[i + 1]!;
    const currentEnd = parseEventTime(current.endsAt ?? current.startsAt) + 30 * 60_000;
    const nextStart = parseEventTime(next.startsAt);
    if (nextStart < currentEnd) {
      risks.push({
        title: "Calendar conflict",
        description: `"${current.title}" overlaps with "${next.title}"`,
        score: 75,
      });
    }
  }
  return risks;
}

function detectMeetingsWithoutPrepConnector(events: CalEvent[]): Array<{ description: string; title: string; score: number }> {
  const risks: Array<{ description: string; title: string; score: number }> = [];
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
        title: "Meeting may need prep",
        description: `"${event.title}" in next 72h — no prep block detected`,
        score: 65,
      });
    }
  }
  return risks;
}

export function detectUpcomingMeetingsWithoutPrep(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  const hasPrepTask = input.tasks.some(
    (t) => t.status === "open" && /\bprep|brief|review\b/i.test(t.title),
  );

  for (const item of input.sourceItems) {
    if (item.sourceType !== "calendar") continue;
    const title = item.title ?? "Meeting";
    if (hasPrepTask) continue;
    if (/\b(aws|investor|demo|pitch|sync)\b/i.test(title)) {
      found.push(
        buildRisk({
          category: "calendar",
          description: `High-stakes meeting soon without a prep block: ${title}`,
          whyItMatters: "Important calls without prep often miss logistics or talking points.",
          evidence: item.content ?? "",
          impact: 7,
          urgency: 6,
          confidence: 0.75,
          recommendedAction: "Block 30 minutes before the meeting for prep. I can draft a run-of-show.",
          sourceType: "calendar",
          sourceId: item.externalId ?? undefined,
        }),
      );
    }
  }

  const events = parseCalendarEventsFromSources(input.sourceItems);
  for (const cr of detectMeetingsWithoutPrepConnector(events)) {
    found.push(
      buildRisk({
        category: "calendar",
        description: cr.description,
        whyItMatters: "Meeting prep reduces avoidable misses on logistics and talking points.",
        evidence: cr.title,
        impact: 7,
        urgency: 7,
        confidence: 0.8,
        recommendedAction: "Add a prep block and agenda bullets.",
        score: cr.score,
      }),
    );
  }

  for (const cr of detectCalendarConflicts(events)) {
    found.push(
      buildRisk({
        category: "calendar",
        description: cr.description,
        whyItMatters: "Overlapping meetings cause no-shows and rushed handoffs.",
        evidence: cr.title,
        impact: 8,
        urgency: 8,
        confidence: 0.85,
        recommendedAction: "Reschedule or decline one conflicting event.",
        score: cr.score,
      }),
    );
  }

  return found;
}

export function detectOverloadedCalendar(input: RiskScanInput): DetectedRisk[] {
  const events = input.sourceItems.filter((i) => i.sourceType === "calendar");
  if (events.length < 6) return [];
  return [
    buildRisk({
      category: "routine",
      description: `Heavy calendar: ${events.length} events in the next 48h`,
      whyItMatters: "Back-to-back days without focus blocks increase miss rate on replies and prep.",
      evidence: events
        .slice(0, 4)
        .map((e) => e.title)
        .join("; "),
      impact: 6,
      urgency: 5,
      confidence: 0.7,
      recommendedAction:
        "Move deep work to evening or add an 11am prep block before the highest-stakes call.",
    }),
  ];
}
