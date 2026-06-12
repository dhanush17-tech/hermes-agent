/**
 * Supermemory REST client (same backend as https://mcp.supermemory.ai/mcp).
 * @see https://supermemory.ai/docs/memory-api/
 */

export type SupermemoryMetadata = {
  memory_type?: string;
  scope?: string;
  confidence?: string;
  source?: string;
  created_at?: string;
  last_accessed_at?: string;
  access_count?: string;
  expires_at?: string;
  tags?: string;
  [key: string]: string | undefined;
};

export type SupermemoryAddInput = {
  content: string;
  containerTags: string[];
  customId?: string;
  metadata?: SupermemoryMetadata;
};

export type SupermemorySearchHit = {
  content: string;
  score: number;
  id?: string;
  metadata: SupermemoryMetadata;
};

export type SupermemorySearchOptions = {
  containerTags?: string[];
  limit?: number;
  threshold?: number;
  filterTags?: string[];
  minScore?: number;
};

let sharedClient: SupermemoryClient | null | undefined;

function supermemoryFetchTimeoutMs(): number {
  const raw = Number(process.env.SUPERMEMORY_TIMEOUT_MS ?? 8_000);
  return Number.isFinite(raw) && raw > 0 ? raw : 8_000;
}

export class SupermemoryClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = process.env.SUPERMEMORY_BASE_URL?.trim() || "https://api.supermemory.ai",
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
        metadata: this.serializeMetadata(input.metadata),
      }),
      signal: AbortSignal.timeout(supermemoryFetchTimeoutMs()),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supermemory add ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as { id?: string };
    return { id: data.id };
  }

  async search(query: string, options?: SupermemorySearchOptions): Promise<SupermemorySearchHit[]> {
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
      signal: AbortSignal.timeout(supermemoryFetchTimeoutMs()),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supermemory search ${res.status}: ${body.slice(0, 200)}`);
    }

    let hits = this.parseSearchResults(await res.json());

    if (options?.filterTags?.length) {
      hits = hits.filter((hit) => {
        const tags = parseTags(hit.metadata.tags);
        return options.filterTags!.some((tag) => tags.includes(tag));
      });
    }

    if (options?.minScore !== undefined) {
      hits = hits.filter((hit) => hit.score >= options.minScore!);
    }

    void Promise.all(hits.map((hit) => this.touchAccess(hit))).catch(() => {
      /* non-fatal */
    });

    return hits;
  }

  async delete(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v3/documents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.headers(),
      signal: AbortSignal.timeout(supermemoryFetchTimeoutMs()),
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new Error(`Supermemory delete ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  async updateMetadata(id: string, metadata: SupermemoryMetadata): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v3/documents/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ metadata: this.serializeMetadata(metadata) }),
      signal: AbortSignal.timeout(supermemoryFetchTimeoutMs()),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supermemory patch ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  private async touchAccess(hit: SupermemorySearchHit): Promise<void> {
    if (!hit.id) return;
    const accessCount = Number(hit.metadata.access_count ?? "0") + 1;
    await this.updateMetadata(hit.id, {
      ...hit.metadata,
      last_accessed_at: new Date().toISOString(),
      access_count: String(accessCount),
    });
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

  private serializeMetadata(metadata?: SupermemoryMetadata): Record<string, string> | undefined {
    if (!metadata) return undefined;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined) out[key] = value;
    }
    return Object.keys(out).length ? out : undefined;
  }

  parseSearchResults(data: unknown): SupermemorySearchHit[] {
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
    const docMeta = this.parseMetadata(o.metadata ?? (o.document as Record<string, unknown> | undefined)?.metadata);
    const hits: SupermemorySearchHit[] = [];
    for (const chunk of chunks) {
      const hit = this.parseHit(chunk, docMeta);
      if (!hit) continue;
      if (!hit.id && docId) hit.id = docId;
      hits.push(hit);
    }
    return hits;
  }

  private parseHit(item: unknown, inheritedMeta: SupermemoryMetadata = {}): SupermemorySearchHit | null {
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

    const score =
      typeof o.score === "number"
        ? o.score
        : typeof o.similarity === "number"
          ? o.similarity
          : 0;

    const metadata = {
      ...inheritedMeta,
      ...this.parseMetadata(o.metadata ?? doc?.metadata),
    };

    return {
      content: content.trim(),
      score,
      id:
        (typeof o.id === "string" ? o.id : undefined) ||
        (typeof o.documentId === "string" ? o.documentId : undefined),
      metadata,
    };
  }

  private parseMetadata(raw: unknown): SupermemoryMetadata {
    if (!raw || typeof raw !== "object") return {};
    const out: SupermemoryMetadata = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
      else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
    }
    return out;
  }
}

function getSharedClient(): SupermemoryClient | null {
  if (sharedClient === undefined) {
    sharedClient = SupermemoryClient.fromEnv();
  }
  return sharedClient;
}

function defaultContainerTag(containerTag?: string): string {
  return containerTag ?? process.env.SUPERMEMORY_CONTAINER_TAG?.trim() ?? "hermes_default";
}

function buildMetadata(
  metadata: Partial<SupermemoryMetadata> = {},
): SupermemoryMetadata {
  const now = new Date().toISOString();
  return {
    memory_type: metadata.memory_type ?? "durable_fact",
    scope: metadata.scope ?? "default",
    confidence: metadata.confidence ?? "0.8",
    source: metadata.source ?? "hermes",
    created_at: metadata.created_at ?? now,
    last_accessed_at: metadata.last_accessed_at ?? now,
    access_count: metadata.access_count ?? "0",
    tags: metadata.tags ?? "",
    ...metadata,
  };
}

export async function smAdd(
  content: string,
  metadata: Partial<SupermemoryMetadata> = {},
  containerTag?: string,
): Promise<string> {
  const client = getSharedClient();
  if (!client) throw new Error("Supermemory is not configured");
  const result = await client.add({
    content,
    containerTags: [defaultContainerTag(containerTag)],
    metadata: buildMetadata(metadata),
  });
  if (!result.id) throw new Error("Supermemory add returned no id");
  return result.id;
}

export async function smSearch(
  query: string,
  opts: SupermemorySearchOptions & { containerTag?: string } = {},
): Promise<SupermemorySearchHit[]> {
  const client = getSharedClient();
  if (!client) return [];
  return client.search(query, {
    containerTags: [defaultContainerTag(opts.containerTag)],
    limit: opts.limit,
    threshold: opts.threshold,
    filterTags: opts.filterTags,
    minScore: opts.minScore,
  });
}

export async function smDelete(id: string): Promise<void> {
  const client = getSharedClient();
  if (!client) throw new Error("Supermemory is not configured");
  await client.delete(id);
}

export function parseTags(tags?: string): string[] {
  if (!tags?.trim()) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formatTags(tags: string[]): string {
  return tags.join(",");
}
