import type { MemoryService } from "@hermes-os/memory";
import { getProductPersonalizationContext } from "@hermes-os/memory";
import type { ProductRecommendationInput, ProductRecommendationResult, ProductWorkflowStep } from "./types.js";
import { parseProductIntent } from "./product-intent-parser.js";
import { clarifyOrAssume } from "./clarify-or-assume.js";
import {
  extractInlineProductPreferences,
  filterCategoryPreferences,
} from "./product-preference-extractor.js";
import { searchProductCandidates, getKnownFallbacks } from "./product-search-provider.js";
import { extractProductCandidates } from "./product-candidate-extractor.js";
import { buildRecommendation, scoreCandidates, pickCheaperAlternative } from "./product-scorer.js";
import { validateRecommendation, formatValidationFailure } from "./recommendation-validator.js";
import { formatProductRecommendation } from "./recommendation-formatter.js";

export type ProductRecommendationWorkflowDeps = {
  memory: MemoryService;
  onStep?: (step: ProductWorkflowStep) => void;
};

export class ProductRecommendationWorkflow {
  constructor(private readonly deps: ProductRecommendationWorkflowDeps) {}

  async run(input: ProductRecommendationInput): Promise<ProductRecommendationResult> {
    const parsed = input.category ? input : parseProductIntent(input.query);
    const category = parsed.category ?? "general";

    this.emit({ step: "parse", detail: category });

    const personalization = await getProductPersonalizationContext(parsed.query, this.deps.memory, category);
    const inline = extractInlineProductPreferences(parsed.query, category);
    const mergedPersonalization = {
      ...personalization,
      preferences: [
        ...filterCategoryPreferences(personalization.preferences, category),
        ...inline.preferences,
      ],
      constraints: [...personalization.constraints, ...inline.constraints],
    };
    this.emit({ step: "memory", detail: `${mergedPersonalization.preferences.length} preferences` });

    const policy = clarifyOrAssume(parsed.query, category, mergedPersonalization);
    if (policy.action === "ask") {
      return {
        recommendation: emptyRecommendation(),
        formatted: policy.question,
        clarificationQuestion: policy.question,
      };
    }

    const assumptions = policy.assumptions;
    this.emit({ step: "research", detail: "planning searches from preferences and assumptions" });

    const { seeds, limited, provider, researchNotes } = await searchProductCandidates(parsed.query, {
      category,
      budgetMax: parsed.budget?.max,
      preferredRetailers: parsed.preferredRetailers,
      preferences: mergedPersonalization.preferences,
      constraints: mergedPersonalization.constraints,
      assumptions,
      limit: 8,
    });

    let candidateSeeds = seeds;
    if (!candidateSeeds.length) {
      candidateSeeds = getKnownFallbacks(category);
    }

    this.emit({
      step: "search",
      detail: `${candidateSeeds.length} candidates via ${provider}${researchNotes?.length ? ` (${researchNotes.length} research notes)` : ""}`,
    });
    this.emit({ step: "fetch", detail: `extracting ${candidateSeeds.length} product pages in Arc` });
    const candidates = await extractProductCandidates(candidateSeeds);
    const scored = scoreCandidates(candidates, {
      category,
      personalization: mergedPersonalization,
      budgetMax: parsed.budget?.max,
      assumptions,
    });

    if (!scored.length) {
      return {
        recommendation: emptyRecommendation(),
        formatted: formatValidationFailure(["no product candidates found"], category),
      };
    }

    const recommendation = buildRecommendation(scored, {
      assumptions,
      userPreferencesUsed: mergedPersonalization.preferences,
      unknowns: mergedPersonalization.unknowns,
      limitedSearch: limited,
      category,
    });

    let formatted = formatProductRecommendation(recommendation);
    let validation = validateRecommendation(recommendation, formatted);

    this.emit({ step: "validate", detail: validation.valid ? "pass" : validation.errors.join(", ") });

    if (!validation.valid) {
      formatted = formatValidationFailure(validation.errors, category);
    }

    return { recommendation, formatted };
  }

  async runCheaperFollowUp(
    priorCandidates: import("./types.js").ProductCandidate[],
    currentWinner: import("./types.js").ProductCandidate,
    assumptions: string[],
  ): Promise<ProductRecommendationResult | null> {
    const alt = pickCheaperAlternative(priorCandidates, currentWinner);
    if (!alt) return null;
    const recommendation = buildRecommendation(
      [{ ...alt, score: 0.7, scoreBreakdown: {} }],
      {
        assumptions,
        userPreferencesUsed: [],
        unknowns: [],
        limitedSearch: false,
        category: "general",
      },
    );
    recommendation.winner = alt;
    recommendation.alternatives = priorCandidates.filter((c) => c.url !== alt.url).slice(0, 2);
    const formatted = [
      `Cheaper alternative: ${alt.title}`,
      `Link: ${alt.url}`,
      alt.price ? `Price: ~$${alt.price}` : "",
      `Confidence: ${recommendation.confidence}.`,
    ]
      .filter(Boolean)
      .join("\n");
    return { recommendation, formatted };
  }

  private emit(step: ProductWorkflowStep): void {
    this.deps.onStep?.(step);
  }
}

function emptyRecommendation(): import("./types.js").ProductRecommendation {
  return {
    winner: { title: "", url: "", retailer: "", features: [], evidence: [] },
    alternatives: [],
    assumptions: [],
    userPreferencesUsed: [],
    unknowns: [],
    reasoning: "",
    confidence: "low",
  };
}
