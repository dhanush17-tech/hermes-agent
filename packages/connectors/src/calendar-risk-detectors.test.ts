import { describe, expect, it } from "vitest";
import { detectCalendarConflicts, detectMeetingsWithoutPrep } from "./calendar/calendar-risk-detectors.js";
import type { CalendarEvent } from "./calendar/types.js";

describe("calendar risk detectors", () => {
  it("detects overlapping events", () => {
    const events: CalendarEvent[] = [
      { id: "1", title: "Standup", startsAt: "2025-06-01T09:00:00Z", endsAt: "2025-06-01T10:00:00Z" },
      { id: "2", title: "Investor call", startsAt: "2025-06-01T09:30:00Z", endsAt: "2025-06-01T10:30:00Z" },
    ];
    const risks = detectCalendarConflicts(events);
    expect(risks.some((r) => r.title === "Calendar conflict")).toBe(true);
  });

  it("flags important meetings without prep", () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const events: CalendarEvent[] = [
      { id: "1", title: "AWS partner demo", startsAt: tomorrow },
    ];
    const risks = detectMeetingsWithoutPrep(events);
    expect(risks.length).toBeGreaterThan(0);
  });
});
