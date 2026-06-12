export type QuickSearchResult = {
  snippets: string[];
  source: string;
};

/** Fast HTTP search — no Arc browser required. */
export async function quickWebSearch(query: string): Promise<QuickSearchResult> {
  const instant = await tryDuckDuckGoInstant(query);
  if (instant.snippets.length) return instant;

  const html = await tryDuckDuckGoHtml(query);
  if (html.snippets.length) return html;

  return { snippets: [], source: "none" };
}

async function tryDuckDuckGoInstant(query: string): Promise<QuickSearchResult> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return { snippets: [], source: "duckduckgo_instant" };

    const data = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{
        Text?: string;
        FirstURL?: string;
        Topics?: Array<{ Text?: string }>;
      }>;
    };

    const parts: string[] = [];
    if (data.AbstractText?.trim()) {
      parts.push(
        data.AbstractURL
          ? `${data.AbstractText.trim()} (${data.AbstractURL})`
          : data.AbstractText.trim(),
      );
    }

    for (const topic of data.RelatedTopics ?? []) {
      if (topic.Text?.trim()) parts.push(topic.Text.trim());
      for (const sub of topic.Topics ?? []) {
        if (sub.Text?.trim()) parts.push(sub.Text.trim());
      }
    }

    return { snippets: parts.slice(0, 6), source: "duckduckgo_instant" };
  } catch {
    return { snippets: [], source: "duckduckgo_instant" };
  }
}

async function tryDuckDuckGoHtml(query: string): Promise<QuickSearchResult> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "HermesPersonalOS/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { snippets: [], source: "duckduckgo_html" };

    const html = await res.text();
    const snippets = [...html.matchAll(/class="result__snippet"[^>]*>([^<]+)</g)]
      .map((m) =>
        m[1]!
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#x27;/g, "'")
          .trim(),
      )
      .filter((s) => s.length > 20)
      .slice(0, 5);

    return { snippets, source: "duckduckgo_html" };
  } catch {
    return { snippets: [], source: "duckduckgo_html" };
  }
}
