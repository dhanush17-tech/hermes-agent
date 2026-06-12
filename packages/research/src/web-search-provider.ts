import type { ArcSearchHit } from "@hermes-os/browser-control";
import { ArcBrowserSearch, withArcRetry } from "@hermes-os/browser-control";
import type { WebSearchHit } from "./browser-research-loop.js";
import {
  runBrowserResearchLoop,
  type BrowserResearchInput,
  type BrowserResearchResult,
} from "./browser-research-loop.js";

export type { WebSearchHit } from "./browser-research-loop.js";
export {
  planBrowserResearch,
  runBrowserResearchLoop,
  type BrowserResearchInput,
  type BrowserResearchPlan,
  type BrowserResearchResult,
} from "./browser-research-loop.js";

let defaultArcSearch: ArcBrowserSearch | null = null;

export function getArcBrowserSearch(): ArcBrowserSearch {
  if (!defaultArcSearch) defaultArcSearch = new ArcBrowserSearch();
  return defaultArcSearch;
}

export function setArcBrowserSearchForTests(instance: ArcBrowserSearch | null): void {
  defaultArcSearch = instance;
}

function toWebHits(hits: ArcSearchHit[]): WebSearchHit[] {
  return hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet }));
}

/** Single Arc search (uses your local Arc session/cookies). */
export async function searchWeb(query: string, limit = 6): Promise<{ hits: WebSearchHit[]; provider: string }> {
  return withArcRetry(
    async () => {
      const arc = getArcBrowserSearch();
      const hits = await arc.search(query, limit);
      return { hits: toWebHits(hits), provider: "arc" };
    },
    { fallback: () => ({ hits: [], provider: "arc_healed_empty" }) },
  );
}

/** Full research loop: plan → multiple Arc searches. */
export async function searchWebWithResearch(
  input: BrowserResearchInput,
  options?: { maxSearches?: number; minResults?: number; limitPerSearch?: number },
): Promise<BrowserResearchResult> {
  const arc = getArcBrowserSearch();
  return runBrowserResearchLoop(
    input,
    async (query, limit) =>
      withArcRetry(
        async () => toWebHits(await arc.search(query, limit)),
        { fallback: () => [] },
      ),
    options,
  );
}
