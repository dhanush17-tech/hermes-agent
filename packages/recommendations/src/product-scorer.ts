import type { PersonalizationContext } from "@hermes-os/memory";
import type { ProductCandidate, ProductRecommendation } from "./types.js";

export type ScoredCandidate = ProductCandidate & { score: number; scoreBreakdown: Record<string, number> };

const TRUSTED_RETAILERS: Record<string, number> = {
  Amazon: 0.85,
  "Coop Sleep Goods": 0.9,
  Walmart: 0.75,
  Target: 0.75,
  "Best Buy": 0.8,
};

export function scoreCandidates(
  candidates: ProductCandidate[],
  options: {
    category: string;
    personalization: PersonalizationContext;
    budgetMax?: number;
    assumptions: string[];
  },
): ScoredCandidate[] {
  return candidates
    .map((c) => ({
      ...c,
      score: computeScore(c, options),
      scoreBreakdown: computeBreakdown(c, options),
    }))
    .sort((a, b) => b.score - a.score);
}

function computeScore(
  candidate: ProductCandidate,
  options: {
    category: string;
    personalization: PersonalizationContext;
    budgetMax?: number;
    assumptions: string[];
  },
): number {
  const b = computeBreakdown(candidate, options);
  return (
    (b.preferenceFit ?? 0) * 0.35 +
    (b.reviewQuality ?? 0) * 0.2 +
    (b.priceFit ?? 0) * 0.15 +
    (b.retailerTrust ?? 0) * 0.1 +
    (b.featureFit ?? 0) * 0.15 +
    (b.availability ?? 0) * 0.05
  );
}

function computeBreakdown(
  candidate: ProductCandidate,
  options: {
    category: string;
    personalization: PersonalizationContext;
    budgetMax?: number;
    assumptions: string[];
  },
): Record<string, number> {
  const blob = `${candidate.title} ${candidate.features.join(" ")}`.toLowerCase();
  const prefs = options.personalization.preferences.join(" ").toLowerCase();
  const assumptions = options.assumptions.join(" ").toLowerCase();

  let preferenceFit = 0.5;
  if (/side sleeper/i.test(prefs) && /side|cervical|adjustable/i.test(blob)) preferenceFit += 0.3;
  if (/neck pain/i.test(prefs) && /cervical|neck|support/i.test(blob)) preferenceFit += 0.25;
  if (/neck pain/i.test(prefs) && !/cervical|neck/i.test(blob)) preferenceFit -= 0.1;
  if (!/neck pain/i.test(prefs) && !/neck pain/i.test(assumptions) && /cervical/i.test(blob))
    preferenceFit -= 0.15;
  if (/allerg/i.test(prefs) && /down|feather/i.test(blob)) preferenceFit -= 0.4;
  if (!/allerg/i.test(prefs) && !/allerg/i.test(assumptions) && /down/i.test(blob)) preferenceFit -= 0.1;
  if (/adjustable/i.test(blob) && !/side|back|stomach/i.test(prefs)) preferenceFit += 0.15;
  if (/medium|adjustable/i.test(blob) && /general|across sleep/i.test(assumptions)) preferenceFit += 0.2;
  if (options.category === "skincare") {
    if (/oily/i.test(prefs) && /(oil[- ]?free|gel|lightweight|non[- ]?comedogenic)/i.test(blob)) preferenceFit += 0.35;
    if (/oily/i.test(prefs) && /(heavy cream|rich cream|balm)/i.test(blob)) preferenceFit -= 0.25;
    if (/dry/i.test(prefs) && /(cream|hydrating|barrier|ceramide)/i.test(blob)) preferenceFit += 0.3;
    if (/sensitive/i.test(prefs) && /(fragrance[- ]?free|gentle|hypoallergenic)/i.test(blob)) preferenceFit += 0.25;
    if (/acne/i.test(prefs) && /(non[- ]?comedogenic|salicylic|niacinamide)/i.test(blob)) preferenceFit += 0.2;
  }
  preferenceFit = clamp(preferenceFit);

  let reviewQuality = 0.4;
  if (candidate.rating) reviewQuality = Math.min(1, candidate.rating / 5);
  if (candidate.reviewCount) {
    if (candidate.reviewCount > 5000) reviewQuality = Math.min(1, reviewQuality + 0.15);
    else if (candidate.reviewCount > 500) reviewQuality = Math.min(1, reviewQuality + 0.08);
    else if (candidate.reviewCount < 50) reviewQuality -= 0.2;
  } else {
    reviewQuality -= 0.15;
  }
  reviewQuality = clamp(reviewQuality);

  let priceFit = 0.6;
  const budget = options.budgetMax ?? extractBudgetFromAssumptions(options.assumptions) ?? 100;
  if (candidate.price !== undefined) {
    if (candidate.price <= budget) priceFit = 0.9;
    else if (candidate.price <= budget * 1.2) priceFit = 0.6;
    else priceFit = 0.3;
  }

  const retailerTrust = TRUSTED_RETAILERS[candidate.retailer] ?? 0.5;

  let featureFit = 0.5;
  if (options.category === "pillow") {
    if (/adjustable/i.test(blob)) featureFit += 0.25;
    if (/washable|hypoallergenic/i.test(blob)) featureFit += 0.1;
  }
  if (options.category === "skincare") {
    if (/ceramide|hyaluronic|niacinamide/i.test(blob)) featureFit += 0.15;
    if (/spf|sunscreen/i.test(blob)) featureFit += 0.05;
  }
  featureFit = clamp(featureFit);

  let availability = 0.7;
  if (candidate.availability === "in stock") availability = 1;
  if (candidate.availability === "out of stock") availability = 0.2;

  return {
    preferenceFit,
    reviewQuality,
    priceFit,
    retailerTrust,
    featureFit,
    availability,
  };
}

function extractBudgetFromAssumptions(assumptions: string[]): number | undefined {
  for (const a of assumptions) {
    const m = a.match(/under \$(\d+)/i);
    if (m) return Number(m[1]);
  }
  return undefined;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function buildRecommendation(
  scored: ScoredCandidate[],
  options: {
    assumptions: string[];
    userPreferencesUsed: string[];
    unknowns: string[];
    limitedSearch: boolean;
    category: string;
  },
): ProductRecommendation {
  const winner = scored[0]!;
  const alternatives = scored.slice(1, 3);

  const reasoningParts = [
    `Selected ${winner.title} based on preference fit and review quality.`,
  ];
  if (winner.features.includes("adjustable fill")) {
    reasoningParts.push("Adjustable fill handles unknown sleep position better than fixed-height pillows.");
  }
  if (winner.rating && winner.reviewCount) {
    reasoningParts.push(`Rated ${winner.rating}/5 from ${winner.reviewCount} reviews.`);
  } else if (options.limitedSearch) {
    reasoningParts.push("Live product data was limited — recommendation based on known category defaults.");
  }

  const avoidIf: string[] = [];
  if (/memory foam/i.test(winner.features.join(" "))) avoidIf.push("You hate memory foam feel.");
  if (options.category === "pillow") {
    avoidIf.push("You want a very thin stomach-sleeper pillow.");
    avoidIf.push("You need a cooling-specific pillow.");
  }

  let confidence: ProductRecommendation["confidence"] = "medium";
  if (options.limitedSearch || !winner.rating) confidence = "low";
  else if (options.userPreferencesUsed.length >= 2 && winner.rating >= 4) confidence = "high";

  return {
    winner,
    alternatives,
    assumptions: options.assumptions,
    userPreferencesUsed: options.userPreferencesUsed,
    unknowns: options.unknowns,
    reasoning: reasoningParts.join(" "),
    confidence,
    avoidIf,
  };
}

export function pickCheaperAlternative(
  candidates: ProductCandidate[],
  currentWinner: ProductCandidate,
): ProductCandidate | null {
  const withPrice = candidates.filter((c) => c.price !== undefined && c.url !== currentWinner.url);
  withPrice.sort((a, b) => (a.price ?? 9999) - (b.price ?? 9999));
  return withPrice[0] ?? candidates.find((c) => c.url !== currentWinner.url) ?? null;
}
