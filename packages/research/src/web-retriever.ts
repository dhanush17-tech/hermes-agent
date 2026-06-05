import type { RetrievedSnippet } from "./types.js";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDuckDuckGoSnippets(html: string, max: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const linkRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]*)</gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) !== null && results.length < max) {
    const url = match[1]!.replace(/&amp;/g, "&");
    const title = stripHtml(match[2] ?? "");
    const snippet = stripHtml(match[3] ?? "");
    if (url.startsWith("http")) results.push({ title, url, snippet });
  }
  return results;
}

export async function retrieveWebSnippets(
  query: string,
  max = 4,
): Promise<RetrievedSnippet[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.slice(0, 120))}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "HermesPersonalOS/1.0 (research)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const hits = extractDuckDuckGoSnippets(html, max);
    const now = new Date().toISOString();
    return hits.map((h, i) => ({
      sourceKind: "web" as const,
      sourceId: `web:${i}`,
      title: h.title || h.url,
      excerpt: `${h.snippet}\n${h.url}`.slice(0, 700),
      uri: h.url,
      observedAt: now,
    }));
  } catch {
    return [];
  }
}
