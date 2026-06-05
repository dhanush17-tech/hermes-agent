import type { DetectedRisk, RiskScanInput } from "../types.js";
import { buildRisk } from "./shared.js";

export function detectInconsistentPublicCopy(input: RiskScanInput): DetectedRisk[] {
  const social = input.sourceItems.filter((i) => i.sourceType === "social" || i.sourceType === "screen");
  const docs = input.sourceItems.filter((i) => i.sourceType === "local_files");
  if (social.length === 0 || docs.length === 0) return [];

  const eventNames: string[] = [];
  const namePattern = /\b(momentum demo day|sf pitch week|devlabs os|demo day)\b/gi;
  for (const item of [...social, ...docs]) {
    const text = `${item.title ?? ""} ${item.content ?? ""}`;
    for (const match of text.matchAll(namePattern)) {
      eventNames.push(match[0].toLowerCase());
    }
  }
  const unique = [...new Set(eventNames)];
  if (unique.length < 2) return [];

  return [
    buildRisk({
      category: "reputation",
      description: "Inconsistent event naming across captured copy",
      whyItMatters: "Mixed event names in tweets vs docs can confuse investors and sponsors.",
      evidence: `Seen: ${unique.join(" vs ")}`,
      impact: 7,
      urgency: 6,
      confidence: 0.65,
      recommendedAction:
        "Align public copy to one event name. I can draft a corrected tweet — reply show draft",
      preparedWork: "Draft: unify to your primary event brand name before posting.",
    }),
  ];
}

export function detectWeakOrRiskyPublicCopy(input: RiskScanInput): DetectedRisk[] {
  const found: DetectedRisk[] = [];
  for (const item of input.sourceItems) {
    if (item.sourceType !== "social" && item.sourceType !== "screen") continue;
    const text = `${item.title ?? ""} ${item.content ?? ""}`;
    if (/\b(TBD|coming soon|maybe|might|we think)\b/i.test(text) && /\b(launch|event|demo)\b/i.test(text)) {
      found.push(
        buildRisk({
          category: "reputation",
          description: "Public copy may sound tentative or incomplete",
          whyItMatters: "Hedged language on launches weakens founder credibility.",
          evidence: text.slice(0, 200),
          impact: 6,
          urgency: 5,
          confidence: 0.6,
          recommendedAction: "Tighten copy with concrete dates, proof points, and a single CTA.",
        }),
      );
    }
    if (/\b20(2[0-4]|1[0-9])\b/.test(text) && !/\b202[5-9]\b/.test(text)) {
      found.push(
        buildRisk({
          category: "reputation",
          description: "Public copy may reference outdated year",
          whyItMatters: "Stale dates on websites or posts signal neglect.",
          evidence: text.slice(0, 150),
          impact: 5,
          urgency: 4,
          confidence: 0.55,
          recommendedAction: "Update dates and links before publishing.",
        }),
      );
    }
  }
  return found;
}
