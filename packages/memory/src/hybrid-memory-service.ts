import type { MemoriesRepository, MemoryRow } from "@hermes-os/context-graph";
import type { MemoryPolicy } from "./load-memory-policy.js";
import { MemoryService, contextSearchKeywords, type RememberInput } from "./memory-service.js";
import { SupermemoryClient } from "./supermemory-client.js";

export type HybridMemoryOptions = {
  containerTag: string;
  supermemory?: SupermemoryClient | null;
};

/**
 * Local SQLite + Supermemory semantic recall (MCP-compatible cloud store).
 */
export class HybridMemoryService extends MemoryService {
  private readonly sm: SupermemoryClient | null;
  private readonly containerTag: string;

  constructor(
    repo: MemoriesRepository,
    policy: MemoryPolicy,
    options: HybridMemoryOptions,
  ) {
    super(repo, policy);
    this.sm = options.supermemory ?? null;
    this.containerTag = options.containerTag;
  }

  get supermemoryEnabled(): boolean {
    return Boolean(this.sm?.enabled);
  }

  override async remember(input: RememberInput): Promise<MemoryRow> {
    const row = await super.remember(input);
    if (this.sm) {
      try {
        await this.sm.add({
          content: row.content,
          containerTags: [this.containerTag],
          customId: row.id,
          metadata: { memoryType: row.memoryType, source: row.source ?? "hermes" },
        });
      } catch {
        // local row still valid if cloud sync fails
      }
    }
    return row;
  }

  override async search(query: string, limit = 10): Promise<MemoryRow[]> {
    return this.mergeSearch(query, limit);
  }

  override async searchForContext(topic: string, limit = 12): Promise<MemoryRow[]> {
    const trimmed = topic.trim();
    if (trimmed) {
      const direct = await this.mergeSearch(trimmed, limit);
      if (direct.length) return direct;
      for (const keyword of contextSearchKeywords(trimmed)) {
        const rows = await this.mergeSearch(keyword, limit);
        if (rows.length) return rows;
      }
    }
    return this.listRecent(limit);
  }

  override async formatContextForPrompt(topic: string, limit = 12): Promise<string> {
    const rows = await this.searchForContext(topic, limit);
    const lines: string[] = [
      this.supermemoryEnabled
        ? "(Memory: Supermemory + local SQLite)"
        : "(Memory: local SQLite only — set SUPERMEMORY_API_KEY for semantic recall)",
    ];
    if (rows.length) {
      lines.push("Relevant memories:", ...rows.map((r) => `- (${r.memoryType}) ${r.content}`));
    } else {
      lines.push("(No stored memories yet.)");
    }
    return lines.join("\n");
  }

  private async mergeSearch(query: string, limit: number): Promise<MemoryRow[]> {
    const seen = new Set<string>();
    const merged: MemoryRow[] = [];

    if (this.sm && query.trim()) {
      try {
        const hits = await this.sm.search(query, {
          containerTags: [this.containerTag],
          limit,
        });
        for (const hit of hits) {
          const key = hit.content.slice(0, 80);
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(this.hitToRow(hit));
          if (merged.length >= limit) return merged;
        }
      } catch {
        /* fall back to local */
      }
    }

    for (const row of await super.search(query, limit)) {
      if (seen.has(row.content.slice(0, 80))) continue;
      seen.add(row.content.slice(0, 80));
      merged.push(row);
      if (merged.length >= limit) break;
    }
    return merged;
  }

  private hitToRow(hit: { content: string; id?: string }): MemoryRow {
    const now = new Date().toISOString();
    return {
      id: hit.id ?? `sm_${Date.now()}`,
      memoryType: "durable_facts",
      content: hit.content,
      source: "supermemory",
      sourceId: null,
      confidence: 0.9,
      scope: "user",
      expiry: null,
      evidence: hit.content.slice(0, 200),
      createdAt: now,
      updatedAt: now,
    };
  }
}

export function createHybridMemoryService(
  repo: MemoriesRepository,
  policy: MemoryPolicy,
  senderId = "default-user",
): HybridMemoryService {
  const tag =
    process.env.SUPERMEMORY_CONTAINER_TAG?.trim() ||
    `hermes_${senderId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64)}`;
  return new HybridMemoryService(repo, policy, {
    containerTag: tag,
    supermemory: SupermemoryClient.fromEnv(),
  });
}
