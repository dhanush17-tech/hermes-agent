import { generateId } from "@hermes-os/shared";
import type { MemoriesRepository, MemoryRow } from "@hermes-os/context-graph";
import type { MemoryPolicy } from "./load-memory-policy.js";

export type RememberInput = {
  content: string;
  memoryType?: string;
  source?: string;
  sourceId?: string;
  scope?: string;
  evidence?: string;
};

export class MemoryService {
  constructor(
    private readonly repo: MemoriesRepository,
    private readonly policy: MemoryPolicy,
  ) {}

  async remember(input: RememberInput): Promise<MemoryRow> {
    const now = new Date().toISOString();
    const row: MemoryRow = {
      id: generateId("mem"),
      memoryType: input.memoryType ?? "durable_facts",
      content: input.content.trim(),
      source: input.source ?? "user",
      sourceId: input.sourceId ?? null,
      confidence: 0.85,
      scope: input.scope ?? "user",
      expiry: null,
      evidence: input.evidence ?? input.content.slice(0, 200),
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.insert(row);
    return row;
  }

  async forget(memoryId: string): Promise<boolean> {
    return this.repo.delete(memoryId);
  }

  async search(query: string, limit = 10): Promise<MemoryRow[]> {
    return this.repo.search(query, limit);
  }

  /** Broader recall for prompt injection — semantic questions rarely match stored facts verbatim. */
  async searchForContext(topic: string, limit = 12): Promise<MemoryRow[]> {
    const trimmed = topic.trim();
    if (trimmed) {
      const direct = await this.search(trimmed, limit);
      if (direct.length) return direct;
      for (const keyword of contextSearchKeywords(trimmed)) {
        const rows = await this.search(keyword, limit);
        if (rows.length) return rows;
      }
    }
    return this.listRecent(limit);
  }

  async listRecent(limit = 10): Promise<MemoryRow[]> {
    return this.repo.listRecent(limit);
  }

  async count(): Promise<number> {
    return this.repo.count();
  }

  allowedMemoryTypes(): string[] {
    return this.policy.store;
  }

  /** Context block injected into research / general / coding prompts. */
  async formatContextForPrompt(topic: string, limit = 12): Promise<string> {
    const rows = await this.searchForContext(topic, limit);
    if (rows.length) {
      return ["Relevant memories:", ...rows.map((r) => `- (${r.memoryType}) ${r.content}`)].join(
        "\n",
      );
    }
    return "(No stored memories yet.)";
  }
}

export function contextSearchKeywords(topic: string): string[] {
  const t = topic.toLowerCase();
  const keys: string[] = [];
  if (/\b(where|live|location|city|address|home|located)\b/.test(t)) {
    keys.push("live", "location", "city", "home", "from", "based");
  }
  if (/\bweather\b/.test(t)) keys.push("location", "live", "city", "weather");
  if (/\b(prefer|preference|like|favorite|sleep|pillow)\b/.test(t)) {
    keys.push("prefer", "preference");
  }
  return [...new Set(keys)];
}
