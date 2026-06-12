import { looksLikePasswordInChat } from "@hermes-os/credentials";
import type { MemoryCandidate } from "@hermes-os/llm-client";
import { smAdd, smSearch, type SupermemorySearchHit } from "./supermemory-client.js";

export type InjectedContext = {
  systemBlock: string;
  rawMemories: Array<{ content: string; type: string; score: number }>;
};

export type CaptureCandidate = MemoryCandidate;

function envFlag(name: string): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function memoryInjectionEnabled(): boolean {
  return envFlag("MEMORY_INJECTION_ENABLED") || envFlag("SUPERMEMORY_INJECTION_ENABLED");
}

function memoryCaptureEnabled(): boolean {
  return envFlag("MEMORY_CAPTURE_ENABLED") || envFlag("SUPERMEMORY_CAPTURE_ENABLED");
}

function captureThresholdForType(memoryType: string): number {
  if (memoryType === "open_loop") {
    return Number(process.env.MEMORY_OPEN_LOOP_THRESHOLD ?? 0.5);
  }
  return Number(process.env.MEMORY_CAPTURE_THRESHOLD ?? 0.7);
}

function shouldStoreCandidate(candidate: CaptureCandidate): boolean {
  if (looksLikePasswordInChat(candidate.content)) return false;
  return candidate.confidence >= captureThresholdForType(candidate.memory_type);
}

function hitMemoryType(hit: SupermemorySearchHit): string {
  return hit.metadata.memory_type ?? hit.metadata.memoryType ?? "durable_fact";
}

/**
 * Run before every LLM call.
 * Searches Supermemory with the user's message and returns a formatted
 * context block to inject into the system prompt.
 */
export async function injectMemoryContext(
  userMessage: string,
  opts: {
    limit?: number;
    includeTypes?: string[];
    excludeTypes?: string[];
  } = {},
): Promise<InjectedContext> {
  if (!memoryInjectionEnabled()) {
    return { systemBlock: "", rawMemories: [] };
  }

  const limit = opts.limit ?? Number(process.env.MEMORY_INJECT_LIMIT ?? 6);

  let results: SupermemorySearchHit[] = [];
  try {
    results = await smSearch(userMessage, {
      limit: limit + 2,
      minScore: 0.45,
    });
  } catch (err) {
    console.warn(
      "[memory-injection] Supermemory search skipped:",
      err instanceof Error ? err.message : String(err),
    );
  }

  let filtered = results;

  if (opts.includeTypes?.length) {
    filtered = filtered.filter((r) => opts.includeTypes!.includes(hitMemoryType(r)));
  }
  if (opts.excludeTypes?.length) {
    filtered = filtered.filter((r) => !opts.excludeTypes!.includes(hitMemoryType(r)));
  }

  const top = filtered.slice(0, limit);

  if (top.length === 0) {
    return { systemBlock: "", rawMemories: [] };
  }

  const lines = top.map((m) => `- [${hitMemoryType(m)}] ${m.content}`).join("\n");

  return {
    systemBlock: `<memory>\nRelevant context from past conversations:\n${lines}\nUse silently — do not reference these as "memories" to the user.\n</memory>`,
    rawMemories: top.map((m) => ({
      content: m.content,
      type: hitMemoryType(m),
      score: m.score,
    })),
  };
}

/**
 * After an agent response, persist memoryCandidates to Supermemory.
 */
export async function captureMemoryCandidates(candidates: CaptureCandidate[]): Promise<void> {
  if (!memoryCaptureEnabled()) return;

  const toStore = candidates.filter(shouldStoreCandidate);

  await Promise.all(
    toStore.map((candidate) =>
      smAdd(candidate.content, {
        memory_type: candidate.memory_type,
        scope: candidate.scope ?? "default",
        confidence: String(candidate.confidence),
        source: "agent_candidate",
        tags: candidate.tags?.join(",") ?? "",
      }).catch((err) => {
        console.error("[memory-injection] Failed to store candidate:", err);
      }),
    ),
  );
}
