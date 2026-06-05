import { computeProactiveScore } from "@hermes-os/policies";
import type { DetectedRisk, RiskCategory } from "../types.js";

export function buildRisk(
  partial: Omit<DetectedRisk, "score"> & { annoyance?: number; score?: number },
): DetectedRisk {
  const { score: preset, annoyance, ...rest } = partial;
  return {
    ...rest,
    score:
      preset ??
      computeProactiveScore(rest.impact, rest.urgency, rest.confidence, annoyance ?? 1),
  };
}

export function parseCalendarEventsFromSources(
  sourceItems: RiskScanInput["sourceItems"],
): Array<{ id: string; title: string; startsAt: string; endsAt?: string; calendarName?: string }> {
  return sourceItems
    .filter((i) => i.sourceType === "calendar")
    .map((i) => {
      const meta = i.metadata ? safeJson(i.metadata) : {};
      const content = i.content ?? "";
      const startsAt =
        (meta as { startsAt?: string }).startsAt ??
        content.split("@")[0]?.trim() ??
        new Date().toISOString();
      return {
        id: i.externalId ?? i.title ?? "event",
        title: i.title ?? "Meeting",
        startsAt,
        endsAt: (meta as { endsAt?: string }).endsAt,
        calendarName: (meta as { calendarName?: string }).calendarName,
      };
    });
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

import type { RiskScanInput } from "../types.js";
export type { RiskScanInput };
