import type { EmailSummary, GmailOpenLoop } from "./types.js";

const OPEN_LOOP_PATTERN =
  /\b(reply|follow.?up|confirm|waiting|rsvp|deadline|action required)\b/i;

/** Extract open loops from a list of email summaries (multi-account Gmail). */
export function extractOpenLoopsFromEmails(emails: EmailSummary[]): GmailOpenLoop[] {
  return emails
    .filter((e) => OPEN_LOOP_PATTERN.test(`${e.subject} ${e.snippet}`))
    .map((e) => ({
      description: `Email from ${e.from}: ${e.subject}`,
      sourceId: e.id,
      owner: "user",
    }));
}
