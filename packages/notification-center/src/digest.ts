import type { Notification } from "./types.js";

export type DigestEntry = {
  date: string;
  notifications: Notification[];
};

export function buildDailyDigest(date: string, notifications: Notification[]): string {
  const lines = [`Daily digest — ${date}`, ""];
  if (notifications.length === 0) {
    lines.push("No notable items.");
    return lines.join("\n");
  }
  for (const n of notifications) {
    lines.push(`• [${n.priority}] ${n.title}`);
    lines.push(`  ${n.body.slice(0, 120)}`);
  }
  return lines.join("\n");
}

export function buildEveningReview(date: string, notifications: Notification[]): string {
  const lines = [`Evening review — ${date}`, ""];
  if (notifications.length === 0) {
    lines.push("Quiet day — nothing flagged.");
    return lines.join("\n");
  }
  for (const n of notifications) {
    lines.push(`• ${n.title}`);
  }
  return lines.join("\n");
}
