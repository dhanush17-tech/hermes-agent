import { extractHttpsLinks, formatLinksFallback } from "@hermes-os/shared";
import type { ResearchBundle } from "./types.js";

export function simplifyShoppingQuery(text: string): string {
  return text
    .replace(/\b(i want to|i'd like to|could you|can you|give me|send me|find me|the link|links?|url|of the|best|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function defaultShoppingSearchLinks(query: string): string[] {
  const q = simplifyShoppingQuery(query) || query.trim().slice(0, 80);
  const encoded = encodeURIComponent(q);
  return [
    `https://www.amazon.com/s?k=${encoded}`,
    `https://www.google.com/search?q=${encoded}`,
  ];
}

export function collectLinksFromBundle(bundle: ResearchBundle): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (url: string | undefined) => {
    if (!url?.startsWith("http")) return;
    const clean = url.replace(/[),.]+$/, "");
    if (seen.has(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  for (const snippet of bundle.snippets) {
    add(snippet.uri);
    for (const link of extractHttpsLinks(snippet.excerpt)) add(link);
  }
  for (const item of bundle.evidence) {
    add(item.uri);
    for (const link of extractHttpsLinks(item.excerpt)) add(link);
  }

  return out.slice(0, 8);
}

export function formatShoppingResearchFallback(userQuery: string, bundle: ResearchBundle): string {
  const links = collectLinksFromBundle(bundle);
  const fallback = links.length ? links : defaultShoppingSearchLinks(userQuery);
  return formatLinksFallback(fallback, `Links for "${userQuery.slice(0, 100).trim()}":`);
}

export function isEmptyResearchAnswer(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return /^No response from Cloudflare Workers AI\.?$/i.test(t);
}

export function shoppingMemoryTopic(query: string, fallback?: string): string {
  if (/\b(pillow|piilow|mattress|bedding|sleep)\b/i.test(query)) {
    return "sleep pillow preferences side sleeper soft firm bedding";
  }
  if (/\b(buy|purchase|get me|shopping|recommend)\b/i.test(query)) {
    return `${query} user preferences recommendations`;
  }
  return fallback ?? query;
}

export function extractPreferenceHints(memoryContext: string): string[] {
  const hints: string[] = [];
  if (/side\s*sleeper/i.test(memoryContext)) hints.push("side sleeper");
  if (/\bsoft\b/i.test(memoryContext)) hints.push("soft");
  if (/\bfirm\b/i.test(memoryContext)) hints.push("firm");
  if (/pillow/i.test(memoryContext)) hints.push("pillow");
  if (/prefer/i.test(memoryContext)) hints.push("your preferences");
  return [...new Set(hints)];
}

export function formatMemoryInformedShoppingReply(
  userQuery: string,
  memoryContext: string,
  bundle: ResearchBundle,
): string {
  const hints = extractPreferenceHints(memoryContext);
  const searchBase = [simplifyShoppingQuery(userQuery), ...hints].filter(Boolean).join(" ");
  const links = collectLinksFromBundle(bundle);
  const fallbackLinks = defaultShoppingSearchLinks(searchBase || "pillow");
  const allLinks = links.length ? links : fallbackLinks;
  const intro =
    hints.length > 0
      ? `Based on what I remember (${hints.slice(0, 3).join(", ")}), start here:`
      : `Here are links for ${simplifyShoppingQuery(userQuery) || "that"}:`;
  return formatLinksFallback(allLinks, intro);
}
