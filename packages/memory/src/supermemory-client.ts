/**
 * Supermemory REST client (same backend as https://mcp.supermemory.ai/mcp).
 * @see https://supermemory.ai/docs/memory-api/
 */

export type SupermemoryAddInput = {
  content: string;
  containerTags: string[];
  customId?: string;
  metadata?: Record<string, string>;
};

export type SupermemorySearchHit = {
  content: string;
  score?: number;
  id?: string;
};

export class SupermemoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.supermemory.ai",
  ) {}

  static fromEnv(): SupermemoryClient | null {
    const key = process.env.SUPERMEMORY_API_KEY?.trim();
    if (!key?.startsWith("sm_")) return null;
    return new SupermemoryClient(key);
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async add(input: SupermemoryAddInput): Promise<{ id?: string }> {
    const res = await fetch(`${this.baseUrl}/v3/documents`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        content: input.content,
        containerTags: input.containerTags,
        customId: input.customId,
        metadata: input.metadata,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supermemory add ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id };
  }

  async search(
    query: string,
    options?: { containerTags?: string[]; limit?: number; threshold?: number },
  ): Promise<SupermemorySearchHit[]> {
    const res = await fetch(`${this.baseUrl}/v3/search`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        q: query,
        limit: options?.limit ?? 10,
        threshold: options?.threshold ?? 0.5,
        containerTags: options?.containerTags,
        searchMode: "hybrid",
        rerank: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supermemory search ${res.status}: ${body.slice(0, 200)}`);
    }
    return this.parseSearchResults(await res.json());
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    const project = process.env.SUPERMEMORY_PROJECT?.trim();
    if (project) h["x-sm-project"] = project;
    return h;
  }

  private parseSearchResults(data: unknown): SupermemorySearchHit[] {
    if (!data || typeof data !== "object") return [];
    const root = data as Record<string, unknown>;
    const lists = [
      root.results,
      root.memories,
      root.chunks,
      (root.data as Record<string, unknown> | undefined)?.results,
    ];
    const hits: SupermemorySearchHit[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        for (const hit of this.parseItemHits(item)) {
          const key = hit.content.slice(0, 120);
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push(hit);
        }
      }
    }
    return hits;
  }

  private parseItemHits(item: unknown): SupermemorySearchHit[] {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    const direct = this.parseHit(item);
    if (direct) return [direct];

    const chunks = o.chunks;
    if (!Array.isArray(chunks)) return [];

    const docId = typeof o.documentId === "string" ? o.documentId : undefined;
    const hits: SupermemorySearchHit[] = [];
    for (const chunk of chunks) {
      const hit = this.parseHit(chunk);
      if (!hit) continue;
      if (!hit.id && docId) hit.id = docId;
      hits.push(hit);
    }
    return hits;
  }

  private parseHit(item: unknown): SupermemorySearchHit | null {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const doc = o.document as Record<string, unknown> | undefined;
    const docContent = typeof doc?.content === "string" ? doc.content : null;
    const content =
      (typeof o.content === "string" ? o.content : null) ||
      (typeof o.memory === "string" ? o.memory : null) ||
      (typeof o.chunk === "string" ? o.chunk : null) ||
      (typeof o.text === "string" ? o.text : null) ||
      docContent;
    if (!content?.trim()) return null;
    return {
      content: content.trim(),
      score: typeof o.score === "number" ? o.score : undefined,
      id:
        (typeof o.id === "string" ? o.id : undefined) ||
        (typeof o.documentId === "string" ? o.documentId : undefined),
    };
  }
}
