import {
  buildResearchPlan,
  type ResearchPlan,
  type ResearchOutputFormat,
} from "@hermes-os/shared";
import { applySourceSelection } from "./source-selector.js";
import type { ResearchRunPlan, ResearchType } from "./types.js";

export function classifyResearchType(question: string, outputFormat: ResearchOutputFormat): ResearchType {
  if (outputFormat === "implementation_plan") return "implementation_plan";
  if (outputFormat === "decision") return "decision_analysis";

  const q = question.toLowerCase();
  if (/\b(meeting prep|prepare for|before (the|my) (call|meeting))\b/i.test(q)) {
    return "meeting_prep";
  }
  if (/\b(who is waiting|what am i missing|open loops?|my calendar today)\b/i.test(q)) {
    return "personal_context_question";
  }
  if (/\b(competitor|competitive|vs\.|versus|market landscape)\b/i.test(q)) {
    return "competitive_analysis";
  }
  if (/\b(quick|tl;dr|one line|short answer)\b/i.test(q)) return "quick_answer";
  if (outputFormat === "brief") return "quick_answer";
  return "deep_memo";
}

export function createResearchRunPlan(userQuestion: string): ResearchRunPlan {
  const plan = buildResearchPlan(userQuestion);
  const researchType = classifyResearchType(userQuestion, plan.outputFormat);
  return applySourceSelection({
    ...plan,
    researchType,
    selectedSources: [],
  });
}

export function researchTypeLabel(type: ResearchType): string {
  return type.replace(/_/g, " ");
}

export function formatResearchRunPlan(plan: ResearchRunPlan): string {
  return [
    `Research type: ${researchTypeLabel(plan.researchType)}`,
    `Output: ${plan.outputFormat}`,
    `Freshness: ${plan.freshnessRequirement}`,
    `Sources: ${plan.sourcesNeeded.join(", ")}`,
    "Sub-questions:",
    ...plan.subQuestions.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}

export { type ResearchPlan };
