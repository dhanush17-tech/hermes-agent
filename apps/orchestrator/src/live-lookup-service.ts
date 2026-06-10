import { createResearchEngine } from "@hermes-os/research";
import type { MemoryService } from "@hermes-os/memory";
import { requiresLiveLookup } from "./live-lookup.js";

export function isLiveLookupFollowUp(text: string): boolean {
  return /\b(check|look up|find|search|current|latest|now|today|right now)\b/i.test(text);
}

export function recentLiveLookupInHistory(
  history: Array<{ role: string; content: string }> | undefined,
): boolean {
  if (!history?.length) return false;
  return history
    .slice(-8)
    .some((turn) => turn.role === "user" && requiresLiveLookup(turn.content));
}

export function shouldHandleLiveLookupTurn(
  text: string,
  history: Array<{ role: string; content: string }> | undefined,
): boolean {
  if (requiresLiveLookup(text)) return true;
  if (isLiveLookupFollowUp(text) && recentLiveLookupInHistory(history)) return true;
  return false;
}

export async function handleLiveLookupTurn(
  text: string,
  deps: { memoryService: MemoryService; workspaceRoot: string },
  conversationHistory?: Array<{ role: string; content: string }>,
): Promise<string> {
  const query = buildResearchQuery(text, conversationHistory);
  const engine = createResearchEngine({
    memory: deps.memoryService,
    workspaceRoot: deps.workspaceRoot,
  });
  return engine.run(query, { skipMemoryWrite: true });
}

function buildResearchQuery(
  text: string,
  history?: Array<{ role: string; content: string }>,
): string {
  if (requiresLiveLookup(text)) return text;

  const prior = history
    ?.slice()
    .reverse()
    .find((turn) => turn.role === "user" && requiresLiveLookup(turn.content));
  if (prior) {
    return `${prior.content} — follow-up: ${text}`;
  }
  return text;
}
