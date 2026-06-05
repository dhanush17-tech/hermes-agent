import type { EmailThread } from "./types.js";

export function summarizeThread(thread: EmailThread, maxLength = 400): string {
  const latest = thread.messages.at(-1);
  if (!latest) return thread.subject;
  const body = latest.body.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return `${thread.subject}\nFrom: ${latest.from}\n${body}`;
}

export function threadNeedsReply(thread: EmailThread): boolean {
  const blob = thread.messages.map((m) => m.body).join("\n");
  return /\?/.test(blob) || /\b(please confirm|waiting for|let me know)\b/i.test(blob);
}
