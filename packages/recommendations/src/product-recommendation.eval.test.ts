import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ProductRecommendationWorkflow,
  validateRecommendation,
  isSearchPageUrl,
  isDirectProductUrl,
  formatProductRecommendation,
  explainRecommendation,
} from "./index.js";
import type { ProductRecommendation, ProductCandidate } from "./types.js";
import { buildCandidateFromPage } from "./product-candidate-extractor.js";
import { filterSnippetsByIntent } from "@hermes-os/research";
import type { RetrievedSnippet } from "@hermes-os/research";

const COOP_URL = "https://coopsleepgoods.com/products/the-original-pillow";

const mockMemory = {
  searchForContext: vi.fn(async (_q: string) => [] as Array<{ content: string; memoryType: string }>),
  search: vi.fn(async () => []),
  formatContextForPrompt: vi.fn(async () => ""),
  remember: vi.fn(async () => ({})),
};

vi.mock("@hermes-os/research", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hermes-os/research")>();
  return {
    ...actual,
    searchWebWithResearch: vi.fn(async () => ({
      hits: [
        {
          title: "Coop Sleep Goods Original Adjustable Pillow",
          url: COOP_URL,
          snippet: "Adjustable fill pillow",
        },
        {
          title: "Beckham Hotel Collection Bed Pillows",
          url: "https://www.amazon.com/dp/B01BX8KOP0",
          snippet: "Budget alternative",
        },
        {
          title: "Tempur-Pedic TEMPUR-Cloud Pillow",
          url: "https://www.amazon.com/dp/B0029LHHP4",
          snippet: "Premium option",
        },
      ],
      researchNotes: ["User request: best pillow to buy", "Category: pillow"],
      searchesRun: 2,
      provider: "arc",
    })),
  };
});

vi.mock("./product-search-provider.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./product-search-provider.js")>();
  return actual;
});

vi.mock("./product-page-fetcher.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./product-page-fetcher.js")>();
  return {
    ...actual,
    fetchProductPage: vi.fn(async (url: string) => ({
      url,
      ok: true,
      html: `<html><script type="application/ld+json">${JSON.stringify({
        "@type": "Product",
        name: "Coop Sleep Goods Original Adjustable Pillow",
        offers: { price: "75" },
        aggregateRating: { ratingValue: "4.5", reviewCount: "12000" },
      })}</script></html>`,
      canonicalUrl: url,
    })),
  };
});

describe("product recommendation evals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. pillow query must not return only search URLs", async () => {
    mockMemory.searchForContext.mockResolvedValueOnce([
      { content: "User is a side sleeper", memoryType: "preferences" },
      { content: "Budget under $80", memoryType: "shopping_preference" },
    ]);
    const workflow = new ProductRecommendationWorkflow({ memory: mockMemory as never });
    const result = await workflow.run({ query: "best pillow to buy, side sleeper under $80", category: "pillow" });

    expect(result.formatted).not.toMatch(/amazon\.com\/s\?k=/);
    expect(result.formatted).not.toMatch(/google\.com\/search/);
    expect(result.recommendation.winner.url).toBeTruthy();
    expect(isDirectProductUrl(result.recommendation.winner.url)).toBe(true);
    expect(result.recommendation.assumptions.length).toBeGreaterThan(0);
    expect(result.recommendation.reasoning).toBeTruthy();
    expect(result.recommendation.confidence).toBeTruthy();
  });

  it("2. personalization honesty on follow-up", () => {
    const rec: ProductRecommendation = {
      winner: {
        title: "Coop Pillow",
        url: COOP_URL,
        retailer: "Coop",
        features: ["adjustable"],
        evidence: [],
      },
      alternatives: [],
      assumptions: ["general adult use", "under $100"],
      userPreferencesUsed: [],
      unknowns: ["sleep position", "budget"],
      reasoning: "Adjustable fill for unknown sleep position.",
      confidence: "medium",
    };
    const reply = explainRecommendation(rec, "how did you decide this is right for me");
    expect(reply).toMatch(/did not have enough personal memory|Assumptions/i);
    expect(reply).not.toMatch(/google\.com\/search/);
  });

  it("3. memory usage for side sleeper with neck pain", async () => {
    mockMemory.searchForContext.mockResolvedValueOnce([
      { content: "User is a side sleeper with neck pain", memoryType: "preferences" },
    ]);
    const workflow = new ProductRecommendationWorkflow({ memory: mockMemory as never });
    const result = await workflow.run({ query: "best pillow for me", category: "pillow" });
    expect(result.recommendation.userPreferencesUsed.some((p) => /side sleeper|neck pain/i.test(p))).toBe(true);
  });

  it("4. missing memory asks clarifying questions before recommending", async () => {
    mockMemory.searchForContext.mockResolvedValue([]);
    const workflow = new ProductRecommendationWorkflow({ memory: mockMemory as never });
    const result = await workflow.run({
      query: "I want to buy a pillow, could you give me the link of the best pillow to buy",
      category: "pillow",
    });
    expect(result.clarificationQuestion).toBeTruthy();
    expect(result.formatted).toMatch(/sleep position|budget|remember/i);
  });

  it("5. source filtering excludes Slack from product answers", () => {
    const snippets: RetrievedSnippet[] = [
      {
        sourceKind: "memory",
        sourceId: "m1",
        title: "Slack alert",
        excerpt: "Zelle security alert in Slack",
        uri: "https://slack.com/archives/123",
        observedAt: new Date().toISOString(),
      },
      {
        sourceKind: "web",
        sourceId: "w1",
        title: "Coop Pillow",
        excerpt: "Product page",
        uri: COOP_URL,
        observedAt: new Date().toISOString(),
      },
    ];
    const filtered = filterSnippetsByIntent(snippets, "product_recommendation");
    expect(filtered.some((s) => /slack/i.test(s.excerpt))).toBe(false);
    expect(filtered.some((s) => s.uri === COOP_URL)).toBe(true);
  });

  it("6. follow-up integrity uses structured result", () => {
    const rec: ProductRecommendation = {
      winner: { title: "Coop", url: COOP_URL, retailer: "Coop", features: [], evidence: [], price: 75 },
      alternatives: [
        { title: "Cheap", url: "https://www.amazon.com/dp/B01BX8KOP0", retailer: "Amazon", features: [], evidence: [], price: 30 },
      ],
      assumptions: ["under $100"],
      userPreferencesUsed: [],
      unknowns: [],
      reasoning: "test",
      confidence: "medium",
    };
    const cheaper = rec.alternatives[0]!;
    const formatted = formatProductRecommendation({ ...rec, winner: cheaper, alternatives: [rec.winner] });
    expect(formatted).toContain("amazon.com/dp/");
  });

  it("7. search provider failure gives honest low-confidence response", async () => {
    const { searchWebWithResearch } = await import("@hermes-os/research");
    vi.mocked(searchWebWithResearch).mockResolvedValueOnce({
      hits: [],
      researchNotes: ["User request: best pillow to buy"],
      searchesRun: 2,
      provider: "arc",
    });
    const workflow = new ProductRecommendationWorkflow({ memory: mockMemory as never });
    const result = await workflow.run({ query: "best pillow to buy", category: "pillow" });
    expect(result.recommendation.confidence).toMatch(/low|medium/);
    expect(result.formatted).not.toMatch(/google\.com\/search/);
  });

  it("8. validator blocks search-only URLs", () => {
    const badRec: ProductRecommendation = {
      winner: {
        title: "Search",
        url: "https://www.amazon.com/s?k=pillow",
        retailer: "Amazon",
        features: [],
        evidence: [],
      },
      alternatives: [],
      assumptions: [],
      userPreferencesUsed: [],
      unknowns: [],
      reasoning: "",
      confidence: "low",
    };
    const formatted = "Links: https://www.amazon.com/s?k=pillow https://www.google.com/search?q=pillow";
    const validation = validateRecommendation(badRec, formatted);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some((e) => /search/i.test(e))).toBe(true);
  });
});

describe("url utils", () => {
  it("detects search vs product URLs", () => {
    expect(isSearchPageUrl("https://www.amazon.com/s?k=pillow")).toBe(true);
    expect(isDirectProductUrl(COOP_URL)).toBe(true);
  });
});

describe("candidate extraction", () => {
  it("extracts JSON-LD product data", () => {
    const candidate = buildCandidateFromPage(
      { title: "Coop", url: COOP_URL, retailer: "Coop" },
      {
        url: COOP_URL,
        ok: true,
        html: `<script type="application/ld+json">${JSON.stringify({
          "@type": "Product",
          name: "Coop Sleep Goods Original Adjustable Pillow",
          offers: { price: "75" },
          aggregateRating: { ratingValue: "4.5", reviewCount: "12000" },
        })}</script>`,
      },
    );
    expect(candidate.title).toContain("Coop");
    expect(candidate.price).toBe(75);
    expect(candidate.rating).toBe(4.5);
  });
});
