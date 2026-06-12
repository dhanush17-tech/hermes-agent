export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type BrowserResearchInput = {
  userQuery: string;
  category?: string;
  preferences?: string[];
  constraints?: string[];
  assumptions?: string[];
  budgetMax?: number;
  preferredRetailers?: string[];
};

export type BrowserResearchPlan = {
  researchNotes: string[];
  searchQueries: string[];
};

export type BrowserResearchResult = {
  hits: WebSearchHit[];
  researchNotes: string[];
  searchesRun: number;
  provider: string;
};

export type ArcSearchFn = (query: string, limit?: number) => Promise<WebSearchHit[]>;

/** Research phase: decide what to search before opening the browser. */
export function planBrowserResearch(input: BrowserResearchInput): BrowserResearchPlan {
  const researchNotes: string[] = [];
  const searchQueries: string[] = [];

  researchNotes.push(`User request: ${input.userQuery.trim()}`);
  if (input.category) researchNotes.push(`Product category: ${input.category}`);
  if (input.preferences?.length) {
    researchNotes.push(`Known preferences: ${input.preferences.join(", ")}`);
  }
  if (input.constraints?.length) {
    researchNotes.push(`Constraints: ${input.constraints.join(", ")}`);
  }
  if (input.assumptions?.length) {
    researchNotes.push(`Working assumptions: ${input.assumptions.slice(0, 4).join("; ")}`);
  }

  const cat = input.category ?? "product";
  const base = simplifyQuery(input.userQuery);

  if (isPriceOrSaleQuery(input.userQuery)) {
    searchQueries.push(`${base} price sale discount`.trim());
    searchQueries.push(`${base} current price apple store`.trim());
    searchQueries.push(`site:apple.com ${base}`.trim());
    const unique = [...new Set(searchQueries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
    return { researchNotes, searchQueries: unique.slice(0, 4) };
  }

  searchQueries.push(`${base} best ${cat} buy reviews`.trim());

  if (input.budgetMax) {
    searchQueries.push(`best ${cat} under $${input.budgetMax} reviews`);
  }

  if (input.preferences?.some((p) => /side sleeper/i.test(p)) && cat === "pillow") {
    searchQueries.push("best pillow for side sleepers");
  }
  if (input.preferences?.some((p) => /neck pain/i.test(p))) {
    searchQueries.push(`best ${cat} for neck pain`);
  }

  if (input.preferredRetailers?.includes("Amazon")) {
    searchQueries.push(`site:amazon.com ${cat} ${base}`.trim());
  } else if (!input.preferredRetailers?.length) {
    searchQueries.push(`${cat} ${base} amazon`.trim());
  }

  const unique = [...new Set(searchQueries.map((q) => q.replace(/\s+/g, " ").trim()).filter(Boolean))];
  return {
    researchNotes,
    searchQueries: unique.slice(0, 4),
  };
}

/**
 * Iterating browser research loop:
 * 1. Plan searches from user context (no browser yet)
 * 2. Run each search in Arc until enough evidence
 */
export async function runBrowserResearchLoop(
  input: BrowserResearchInput,
  searchFn: ArcSearchFn,
  options?: { maxSearches?: number; minResults?: number; limitPerSearch?: number },
): Promise<BrowserResearchResult> {
  const maxSearches = options?.maxSearches ?? 3;
  const minResults = options?.minResults ?? 4;
  const limitPerSearch = options?.limitPerSearch ?? 8;

  const plan = planBrowserResearch(input);
  const hits: WebSearchHit[] = [];
  const seen = new Set<string>();
  let searchesRun = 0;

  for (const query of plan.searchQueries.slice(0, maxSearches)) {
    searchesRun += 1;
    const batch = await searchFn(query, limitPerSearch);
    for (const hit of batch) {
      const key = hit.url.split("?")[0] ?? hit.url;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
    if (hits.length >= minResults) break;
  }

  return {
    hits,
    researchNotes: plan.researchNotes,
    searchesRun,
    provider: "arc",
  };
}

function isPriceOrSaleQuery(text: string): boolean {
  return /\b(on sale|price drop|discounted|discount|deal|cheaper now|how much|current price|price of|is .+ on sale|any sales|price cut)\b/i.test(
    text,
  );
}

function simplifyQuery(text: string): string {
  return text
    .replace(/\b(i want to|i'd like to|could you|can you|give me|send me|find me|the link|links?|url|of the|best|please|buy me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
