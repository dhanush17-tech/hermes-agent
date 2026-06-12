import {
  searchWebWithResearch,
  type BrowserResearchInput,
} from "@hermes-os/research";
import type { ProductCandidateSeed, ProductSearchOptions } from "./types.js";
import { detectRetailer, isDirectProductUrl, isSearchPageUrl } from "./url-utils.js";

export interface ProductSearchProvider {
  searchProducts(query: string, options: ProductSearchOptions): Promise<ProductCandidateSeed[]>;
  name: string;
  limited?: boolean;
}

export type ProductSearchContext = ProductSearchOptions & {
  preferences?: string[];
  constraints?: string[];
  assumptions?: string[];
};

const KNOWN_FALLBACKS: Record<string, ProductCandidateSeed[]> = {
  pillow: [
    {
      title: "Coop Sleep Goods Original Adjustable Pillow",
      url: "https://coopsleepgoods.com/products/the-original-pillow",
      retailer: "Coop Sleep Goods",
      snippet: "Adjustable fill pillow for side/back sleepers",
    },
  ],
};

function hitsToSeeds(
  hits: Array<{ title: string; url: string; snippet: string }>,
  researchNotes: string[],
): ProductCandidateSeed[] {
  return hits
    .filter((h) => !isSearchPageUrl(h.url))
    .map((hit) => ({
      title: hit.title,
      url: hit.url,
      retailer: detectRetailer(hit.url),
      snippet: hit.snippet || researchNotes[0] || "",
    }));
}

function dedupeSeeds(seeds: ProductCandidateSeed[]): ProductCandidateSeed[] {
  const seen = new Set<string>();
  return seeds.filter((s) => {
    const key = s.url.split("?")[0] ?? s.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchProductCandidates(
  query: string,
  options: ProductSearchContext,
): Promise<{ seeds: ProductCandidateSeed[]; limited: boolean; provider: string; researchNotes?: string[] }> {
  const input: BrowserResearchInput = {
    userQuery: query,
    category: options.category,
    preferences: options.preferences,
    constraints: options.constraints,
    assumptions: options.assumptions,
    budgetMax: options.budgetMax,
    preferredRetailers: options.preferredRetailers,
  };

  const result = await searchWebWithResearch(input, {
    maxSearches: 3,
    minResults: 6,
    limitPerSearch: options.limit ?? 8,
  });

  const seeds = dedupeSeeds(hitsToSeeds(result.hits, result.researchNotes)).slice(0, options.limit ?? 8);
  const direct = seeds.filter((s) => isDirectProductUrl(s.url) || !isSearchPageUrl(s.url));

  if (direct.length) {
    return {
      seeds: direct,
      limited: false,
      provider: "arc_browser",
      researchNotes: result.researchNotes,
    };
  }

  const fallback = KNOWN_FALLBACKS[options.category ?? "general"] ?? [];
  return {
    seeds: fallback,
    limited: true,
    provider: fallback.length ? "manual_fallback" : "none",
    researchNotes: result.researchNotes,
  };
}

export function getKnownFallbacks(category: string): ProductCandidateSeed[] {
  return KNOWN_FALLBACKS[category] ?? [];
}
