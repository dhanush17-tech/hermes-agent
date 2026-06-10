export function buildWebSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim().slice(0, 300))}`;
}

/**
 * LLMs often send { query: "..." } or {} instead of { url: "..." } for web.fetch.
 */
export function normalizeWebFetchPayload(
  payload: Record<string, unknown> | undefined,
  fallbackQuery?: string,
): { ok: true; url: string } | { ok: false; reason: string } {
  const body = payload ?? {};
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (rawUrl) {
    return { ok: true, url: rawUrl };
  }

  const query =
    (typeof body.query === "string" && body.query.trim()) ||
    (typeof body.q === "string" && body.q.trim()) ||
    (typeof body.search === "string" && body.search.trim()) ||
    fallbackQuery?.trim() ||
    "";

  if (query) {
    return { ok: true, url: buildWebSearchUrl(query) };
  }

  return {
    ok: false,
    reason: 'web.fetch requires payload.url (https://...) or payload.query — e.g. {"url":"https://apple.com/iphone"}',
  };
}
