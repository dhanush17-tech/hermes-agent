import type { PersonalizationContext } from "@hermes-os/memory";
import type { ClarifyOrAssumeResult } from "./types.js";
import {
  buildClarificationQuestion,
  extractInlineProductPreferences,
  extractSkinType,
  filterCategoryPreferences,
} from "./product-preference-extractor.js";

const CATEGORY_KEY_PREFS: Record<string, string[]> = {
  pillow: ["sleep position", "budget", "firmness", "material/allergy", "neck pain"],
  monitor: ["size", "resolution", "budget", "use case"],
  laptop: ["budget", "use case", "portability", "OS preference"],
  phone: ["budget", "carrier", "storage", "use case"],
  headphones: ["budget", "wireless", "noise cancelling", "use case"],
  desk: ["budget", "height range", "desk size"],
  skincare: ["skin type", "concerns", "budget"],
  general: ["budget", "use case"],
};

const DEFAULT_ASSUMPTIONS: Record<string, string[]> = {
  pillow: [
    "general adult use",
    "US shipping",
    "under $100 unless budget specified",
    "no known allergies",
    "works across sleep positions (side/back)",
  ],
  monitor: ["general office use", "under $400 unless budget specified", "27 inch sweet spot"],
  laptop: ["general productivity", "under $1200 unless budget specified"],
  phone: ["current-generation flagship", "check live pricing and sales", "US retailers"],
  headphones: ["over-ear preferred for general use", "under $200 unless budget specified"],
  desk: ["standard home office", "under $500 unless budget specified"],
  skincare: ["mainstream drugstore brands ok", "fragrance-free preferred unless specified"],
  general: ["general adult use", "mainstream retailers", "balanced default pick"],
};

const CLARIFY_FIRST_CATEGORIES = new Set(["skincare", "pillow"]);

function isPriceOrSaleQuery(query: string): boolean {
  return /\b(on sale|price drop|discounted|discount|deal|cheaper now|how much|current price|price of|is .+ on sale|any sales)\b/i.test(
    query,
  );
}

function hasSkinTypeKnown(
  relevantPrefs: string[],
  inlinePrefs: string[],
  query: string,
): boolean {
  const blob = `${relevantPrefs.join(" ")} ${inlinePrefs.join(" ")} ${query}`;
  return Boolean(extractSkinType(blob) || /\b(oily|dry|normal|combination|sensitive)\s*skin\b/i.test(blob));
}

function countKnownPreferences(
  ctx: PersonalizationContext,
  category: string,
  query: string,
): number {
  const keys = CATEGORY_KEY_PREFS[category] ?? CATEGORY_KEY_PREFS.general!;
  const inline = extractInlineProductPreferences(query, category);
  const prefs = [...filterCategoryPreferences(ctx.preferences, category), ...inline.preferences];
  const constraints = [...ctx.constraints, ...inline.constraints];
  const blob = `${prefs.join(" ")} ${constraints.join(" ")}`.toLowerCase();

  let count = 0;
  for (const key of keys) {
    if (key.includes("skin type") && hasSkinTypeKnown(prefs, inline.preferences, query)) count++;
    else if (key.includes("sleep position") && /\b(side|back|stomach)\s*sleeper\b/i.test(blob)) count++;
    else if (key.includes("concerns") && /\b(acne|redness|anti[- ]?aging|rosacea|hydration)\b/i.test(blob)) count++;
    else if (key.includes("budget") && (/\$\d+/i.test(blob) || constraints.some((c) => /budget/i.test(c)))) count++;
    else if (key.includes("firmness") && /\b(soft|firm|medium)\b/i.test(blob)) count++;
    else if ((key.includes("material") || key.includes("allergy")) && /\b(allerg|down|latex|foam)\b/i.test(blob)) count++;
    else if (key.includes("neck") && /neck/i.test(blob)) count++;
    else if (blob.includes(key.toLowerCase())) count++;
  }
  return count;
}

export function clarifyOrAssume(
  query: string,
  category: string,
  personalization: PersonalizationContext,
): ClarifyOrAssumeResult {
  const relevantPrefs = filterCategoryPreferences(personalization.preferences, category);
  const inline = extractInlineProductPreferences(query, category);
  const known = countKnownPreferences(
    { ...personalization, preferences: relevantPrefs },
    category,
    query,
  );

  const assumptions = [
    ...relevantPrefs.map((p) => `Using remembered preference: ${p}`),
    ...inline.preferences.map((p) => `From your message: ${p}`),
    ...(DEFAULT_ASSUMPTIONS[category] ?? DEFAULT_ASSUMPTIONS.general!),
  ];

  if (category === "skincare" && !hasSkinTypeKnown(relevantPrefs, inline.preferences, query)) {
    return {
      action: "ask",
      question: buildClarificationQuestion(category, personalization.unknowns, query),
    };
  }

  if (CLARIFY_FIRST_CATEGORIES.has(category) && known < 1) {
    return {
      action: "ask",
      question: buildClarificationQuestion(category, personalization.unknowns, query),
    };
  }

  if (known >= 2) {
    return { action: "proceed", assumptions: [...new Set(assumptions)] };
  }

  if (isPriceOrSaleQuery(query)) {
    return {
      action: "proceed",
      assumptions: [...new Set([...assumptions, "User asked about current pricing or sales — search for live deals"])],
    };
  }

  if (CLARIFY_FIRST_CATEGORIES.has(category) && known < 1) {
    return {
      action: "ask",
      question: buildClarificationQuestion(category, personalization.unknowns, query),
    };
  }

  return { action: "proceed", assumptions: [...new Set(assumptions)] };
}

export function buildDefaultAssumptions(category: string): string[] {
  return DEFAULT_ASSUMPTIONS[category] ?? DEFAULT_ASSUMPTIONS.general!;
}
