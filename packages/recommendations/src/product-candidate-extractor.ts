import type { ProductCandidate, ProductCandidateSeed, EvidenceItem } from "./types.js";
import {
  extractJsonLdProduct,
  extractPriceFromHtml,
  extractRatingFromHtml,
  fetchProductPage,
  type FetchedPage,
} from "./product-page-fetcher.js";
import { detectRetailer, normalizeProductUrl } from "./url-utils.js";

export async function extractProductCandidate(seed: ProductCandidateSeed): Promise<ProductCandidate> {
  const page = await fetchProductPage(seed.url);
  return buildCandidateFromPage(seed, page);
}

export function buildCandidateFromPage(seed: ProductCandidateSeed, page: FetchedPage): ProductCandidate {
  const evidence: EvidenceItem[] = [];
  const features: string[] = [];

  let title = seed.title;
  let url = normalizeProductUrl(page.canonicalUrl ?? seed.url);
  let price: number | undefined;
  let rating: number | undefined;
  let reviewCount: number | undefined;
  let availability: string | undefined;
  const retailer = detectRetailer(url);

  if (page.ok && page.html) {
    const jsonLd = extractJsonLdProduct(page.html);
    if (jsonLd) {
      if (typeof jsonLd.name === "string") {
        title = jsonLd.name;
        evidence.push({ claim: `Product name: ${title}`, source: "JSON-LD", uri: url, strength: "strong" });
      }
      const offers = jsonLd.offers as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
      const offer = Array.isArray(offers) ? offers[0] : offers;
      if (offer && (typeof offer.price === "string" || typeof offer.price === "number")) {
        price = Number(offer.price);
        evidence.push({ claim: `Listed price: $${price}`, source: "JSON-LD", uri: url, strength: "strong" });
      }
      const agg = jsonLd.aggregateRating as Record<string, unknown> | undefined;
      if (agg) {
        if (agg.ratingValue) rating = Number(agg.ratingValue);
        if (agg.reviewCount) reviewCount = Number(agg.reviewCount);
        evidence.push({
          claim: `Rating: ${rating ?? "?"} (${reviewCount ?? "?"} reviews)`,
          source: "JSON-LD",
          uri: url,
          strength: "strong",
        });
      }
      if (typeof jsonLd.description === "string") {
        features.push(jsonLd.description.slice(0, 200));
      }
    }

    if (price === undefined) {
      price = extractPriceFromHtml(page.html);
      if (price) {
        evidence.push({ claim: `Price visible: $${price}`, source: "page", uri: url, strength: "weak" });
      }
    }

    const ratingInfo = extractRatingFromHtml(page.html);
    if (rating === undefined && ratingInfo.rating) {
      rating = ratingInfo.rating;
      reviewCount = ratingInfo.reviewCount;
      evidence.push({
        claim: `Rating: ${rating} (${reviewCount ?? "?"} reviews)`,
        source: "page",
        uri: url,
        strength: "weak",
      });
    }

    if (/in stock|available/i.test(page.html)) availability = "in stock";
    else if (/out of stock|unavailable/i.test(page.html)) availability = "out of stock";

    if (seed.snippet) {
      features.push(seed.snippet);
      evidence.push({ claim: seed.snippet, source: "search snippet", uri: url, strength: "weak" });
    }
  } else {
    evidence.push({
      claim: "Page fetch failed — using search snippet only",
      source: "fallback",
      uri: url,
      strength: "weak",
    });
    if (seed.snippet) features.push(seed.snippet);
  }

  if (/adjustable/i.test(`${title} ${features.join(" ")}`)) features.push("adjustable fill");
  if (/memory foam/i.test(`${title} ${features.join(" ")}`)) features.push("memory foam");
  if (/cervical|neck/i.test(`${title} ${features.join(" ")}`)) features.push("cervical support");

  return {
    title,
    url,
    retailer,
    price,
    rating,
    reviewCount,
    availability,
    features: [...new Set(features)].slice(0, 8),
    evidence,
  };
}

export async function extractProductCandidates(seeds: ProductCandidateSeed[]): Promise<ProductCandidate[]> {
  const results = await Promise.all(seeds.slice(0, 8).map((s) => extractProductCandidate(s)));
  return results;
}
