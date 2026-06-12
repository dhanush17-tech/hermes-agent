import type { ProductRecommendation } from "./types.js";
import { isDirectProductUrl, isSearchPageUrl } from "./url-utils.js";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateRecommendation(
  rec: ProductRecommendation,
  formatted: string,
): ValidationResult {
  const errors: string[] = [];

  if (!rec.winner?.title) errors.push("no product selected");
  if (!rec.winner?.url) errors.push("no direct product URL");
  if (rec.winner?.url && isSearchPageUrl(rec.winner.url)) errors.push("winner URL is a search page");
  if (rec.winner?.url && !isDirectProductUrl(rec.winner.url) && isSearchPageUrl(rec.winner.url)) {
    errors.push("only search page URLs");
  }
  if (!rec.reasoning?.trim()) errors.push("no reasoning");
  if (!rec.assumptions?.length) errors.push("no assumptions");
  if (!rec.confidence) errors.push("no confidence");
  if (rec.alternatives.length < 1) errors.push("no alternatives");

  const links = formatted.match(/https?:\/\/[^\s)]+/g) ?? [];
  const searchOnly = links.length > 0 && links.every((u) => isSearchPageUrl(u));
  if (searchOnly) errors.push("formatted answer contains only search URLs");

  if (/slack\.com|zelle|security alert/i.test(formatted)) errors.push("irrelevant sources included");

  const claimsPersonalized =
    /\bbest for you\b|\bperfect for you\b|\bright one for me\b/i.test(formatted) &&
    rec.userPreferencesUsed.length === 0 &&
    !rec.assumptions.some((a) => /assume|don't know|default/i.test(a));
  if (claimsPersonalized) errors.push("claims personalization without preferences or assumptions");

  return { valid: errors.length === 0, errors };
}

const CATEGORY_FAILURE_HINTS: Record<string, string> = {
  pillow: "Try adding your budget, sleep position, or preferred retailer.",
  skincare: "Try adding your skin type, main concern, or budget.",
  phone: "Try naming the exact model and whether you want Apple, carrier, or unlocked pricing.",
  laptop: "Try adding your budget, use case, and preferred retailer.",
  general: "Try adding your budget, use case, or preferred retailer.",
};

export function formatValidationFailure(errors: string[], category = "general"): string {
  const hint = CATEGORY_FAILURE_HINTS[category] ?? CATEGORY_FAILURE_HINTS.general!;
  return [
    "I could not get enough reliable product data to make a confident recommendation.",
    "",
    "What I need:",
    ...errors.map((e) => `- ${e}`),
    "",
    hint,
  ].join("\n");
}

export function repairRecommendationPrompt(
  rec: ProductRecommendation,
  formatted: string,
  errors: string[],
): string {
  return [
    "Fix this product recommendation. Validation failed:",
    ...errors.map((e) => `- ${e}`),
    "",
    "Current recommendation JSON:",
    JSON.stringify(rec, null, 2),
    "",
    "Current formatted answer:",
    formatted,
    "",
    "Return a corrected plain-text answer with:",
    "- One winner with direct product URL (not search page)",
    "- Reasoning, assumptions, confidence, 2 alternatives with direct URLs",
    "- Do not claim personalization without stated preferences or assumptions",
  ].join("\n");
}
