export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  calendarName?: string;
};

export type CalendarRisk = {
  category: "calendar";
  title: string;
  description: string;
  score: number;
};

export interface CalendarConnectorPort {
  getToday(): Promise<CalendarEvent[]>;
  getUpcoming(days: number): Promise<CalendarEvent[]>;
  detectConflicts(): Promise<CalendarRisk[]>;
  detectMeetingsWithoutPrep(): Promise<CalendarRisk[]>;
}
