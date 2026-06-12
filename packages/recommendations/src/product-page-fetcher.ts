export type FetchedPage = {
  url: string;
  html: string;
  ok: boolean;
  canonicalUrl?: string;
};

const JSON_LD_SCRIPT = `JSON.stringify(
  Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map(s => s.textContent)
    .filter(Boolean)
)`;

export async function fetchProductPage(url: string): Promise<FetchedPage> {
  if (process.platform === "darwin" && process.env.VITEST !== "true") {
    const arcPage = await fetchProductPageViaArc(url);
    if (arcPage.ok) return arcPage;
  }
  return fetchProductPageViaHttp(url);
}

async function fetchProductPageViaArc(url: string): Promise<FetchedPage> {
  try {
    const { ArcBrowserSearch } = await import("@hermes-os/browser-control");
    const arc = new ArcBrowserSearch();
    const page = await arc.fetchPageInArc(url);
    const jsonLdChunks = await arc.executeJavaScriptInActiveTab(JSON_LD_SCRIPT).catch(() => "[]");
    const html = wrapArcPageAsHtml(page.text, jsonLdChunks, page.url);
    return {
      url: page.url,
      html,
      ok: Boolean(page.text || html.includes("application/ld+json")),
      canonicalUrl: page.url,
    };
  } catch {
    return { url, html: "", ok: false };
  }
}

function wrapArcPageAsHtml(text: string, jsonLdRaw: string, url: string): string {
  let scripts = "";
  try {
    const chunks = JSON.parse(jsonLdRaw) as string[];
    for (const chunk of chunks) {
      if (chunk?.trim()) {
        scripts += `<script type="application/ld+json">${chunk}</script>`;
      }
    }
  } catch {
    /* ignore */
  }
  return `<html><head><title>${url}</title>${scripts}</head><body>${escapeHtml(text)}</body></html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function fetchProductPageViaHttp(url: string): Promise<FetchedPage> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HermesPersonalOS/1.0 (product-research)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
    if (!res.ok) return { url, html: "", ok: false };
    const html = await res.text();
    const canonical = extractCanonicalUrl(html, url);
    return { url: canonical ?? url, html, ok: true, canonicalUrl: canonical };
  } catch {
    return { url, html: "", ok: false };
  }
}

function extractCanonicalUrl(html: string, fallback: string): string | undefined {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (match?.[1]) {
    try {
      return new URL(match[1], fallback).toString();
    } catch {
      return match[1];
    }
  }
  return undefined;
}

export function extractJsonLdProduct(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]!.trim()) as unknown;
      const product = findProductNode(data);
      if (product) return product;
    } catch {
      /* skip invalid json-ld */
    }
  }
  return null;
}

function findProductNode(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj["@type"] === "Product" || (Array.isArray(obj["@type"]) && obj["@type"].includes("Product"))) {
    return obj;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findProductNode(item);
      if (found) return found;
    }
  }
  if (obj["@graph"] && Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) {
      const found = findProductNode(item);
      if (found) return found;
    }
  }
  return null;
}

export function extractPriceFromHtml(html: string): number | undefined {
  const patterns = [
    /"price"\s*:\s*"?([\d.]+)"?/i,
    /\$\s*([\d,]+(?:\.\d{2})?)/,
    /itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!Number.isNaN(n) && n > 0 && n < 100_000) return n;
    }
  }
  return undefined;
}

export function extractRatingFromHtml(html: string): { rating?: number; reviewCount?: number } {
  const ratingMatch =
    html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i) ??
    html.match(/([\d.]+)\s*out of\s*5/i) ??
    html.match(/itemprop=["']ratingValue["'][^>]*content=["']([\d.]+)["']/i);
  const countMatch =
    html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i) ??
    html.match(/([\d,]+)\s*(?:ratings|reviews)/i);
  return {
    rating: ratingMatch?.[1] ? Number(ratingMatch[1]) : undefined,
    reviewCount: countMatch?.[1] ? Number(countMatch[1].replace(/,/g, "")) : undefined,
  };
}
