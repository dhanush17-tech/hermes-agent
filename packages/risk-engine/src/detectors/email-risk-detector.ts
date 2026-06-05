import type { DetectedRisk, RiskScanInput } from "../types.js";
import { buildRisk } from "./shared.js";

const IMPORTANT_EMAIL =
  /\b(investor|founder|sponsor|aws|venue|logistics|demo day|momentum|devlabs|reply|follow.?up|rsvp|deadline)\b/i;

const WAITING_ON_YOU =
  /\b(waiting (for|on) (your|a) reply|please respond|action required|let me know|still waiting|need your)\b/i;

const PROMISED_FOLLOWUP =
  /\b(i will follow up|i'll follow up|promised to|get back to you|circle back)\b/i;

const DIRECT_QUESTION =
  /\?|can you|could you|would you|when can|please confirm/i;

export function detectUnansweredImportantEmails(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  for (const item of input.sourceItems) {
    if (!["gmail", "twitter", "linkedin", "email"].includes(item.sourceType)) continue;
    const blob = `${item.title ?? ""}\n${item.content ?? ""}`;
    if (!IMPORTANT_EMAIL.test(blob)) continue;
    const from = item.content?.split("\n")[0] ?? "unknown sender";
    found.push(
      buildRisk({
        category: "communication",
        description: `Unread important email: ${item.title ?? "(no subject)"}`,
        whyItMatters: "Someone tied to events, investors, or logistics may be waiting on you.",
        evidence: from.slice(0, 200),
        impact: 8,
        urgency: 7,
        confidence: 0.85,
        recommendedAction: "Draft a reply with logistics, timing, and RSVP details. Reply: show draft",
        preparedWork: `Thread subject: ${item.title ?? ""}. I can draft a reply — say approve when ready.`,
        sourceType: "gmail",
        sourceId: item.externalId ?? undefined,
      }),
    );
  }
  return found;
}

export function detectPersonWaitingForReply(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  for (const item of input.sourceItems) {
    if (!["gmail", "email"].includes(item.sourceType)) continue;
    const blob = `${item.title ?? ""}\n${item.content ?? ""}`;
    if (!WAITING_ON_YOU.test(blob)) continue;
    found.push(
      buildRisk({
        category: "relationship",
        description: `Person waiting for your reply: ${item.title ?? "(no subject)"}`,
        whyItMatters: "Delayed replies on explicit asks damage trust and momentum.",
        evidence: blob.slice(0, 200),
        impact: 9,
        urgency: 8,
        confidence: 0.9,
        recommendedAction: "Reply today or acknowledge with a timeline.",
        sourceType: item.sourceType,
        sourceId: item.externalId ?? undefined,
      }),
    );
  }
  return found;
}

export function detectPromisedFollowUp(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  for (const loop of input.openLoops) {
    if (loop.status !== "open") continue;
    if (!PROMISED_FOLLOWUP.test(loop.description)) continue;
    found.push(
      buildRisk({
        category: "communication",
        description: `Promised follow-up still open: ${loop.description.slice(0, 100)}`,
        whyItMatters: "Outstanding promises erode credibility if overdue.",
        evidence: loop.dueDate ? `Due: ${loop.dueDate}` : loop.description.slice(0, 150),
        impact: 8,
        urgency: 7,
        confidence: 0.8,
        recommendedAction: "Close the loop or send a holding reply.",
      }),
    );
  }
  return found;
}

export function detectDirectQuestionNoReply(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  for (const item of input.sourceItems) {
    if (item.sourceType !== "gmail" && item.sourceType !== "email") continue;
    const blob = `${item.title ?? ""}\n${item.content ?? ""}`;
    if (!DIRECT_QUESTION.test(blob) || !IMPORTANT_EMAIL.test(blob)) continue;
    if (WAITING_ON_YOU.test(blob)) continue;
    found.push(
      buildRisk({
        category: "communication",
        description: `Email may need a direct answer: ${item.title ?? "(no subject)"}`,
        whyItMatters: "Unanswered questions in important threads look like neglect.",
        evidence: blob.slice(0, 180),
        impact: 7,
        urgency: 6,
        confidence: 0.7,
        recommendedAction: "Scan thread and reply with a clear yes/no or next step.",
        sourceType: "gmail",
        sourceId: item.externalId ?? undefined,
      }),
    );
  }
  return found;
}
