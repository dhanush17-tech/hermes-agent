import type { AgentResponse } from "@hermes-os/llm-client";

export function isDeferredActionFinal(final: string | null | undefined): boolean {
  if (!final?.trim()) return false;
  return /\b(let me check|i(?:'ll| will) check|one moment|give me a (?:sec|second|moment)|checking (?:the|that) now|i'll look (?:that|it) up)\b/i.test(
    final,
  );
}

/** Model answered from training data about availability/timing without evidence. */
export function isStaleTemporalClaim(final: string | null | undefined): boolean {
  if (!final?.trim()) return false;
  return /\b(isn't out yet|not out yet|hasn't been released|not released yet|not available yet|expected in|coming (?:soon|in)|anticipated in|rumored for|hasn't launched)\b/i.test(
    final,
  );
}

export function isTrainingDataFallback(final: string | null | undefined): boolean {
  if (!final?.trim()) return false;
  return /\b(as of my (?:last )?training|based on my training|i don't have current|general guidance|typically offers|last training data|my knowledge cutoff)\b/i.test(
    final,
  );
}

export type AgentLoopNudgeReason = "deferred" | "no_tools" | "stale_claim" | "tool_failed" | "training_fallback";

export function agentLoopNudge(reason: AgentLoopNudgeReason): string {
  switch (reason) {
    case "deferred":
      return "You promised to check something but did not call a tool. Run web.fetch (or the right tool) now, then set final to the actual result — not another promise.";
    case "no_tools":
      return 'This question needs live data. Call web.fetch with payload.url (full https URL) or payload.query (search text). Example: {"url":"https://www.apple.com/iphone/"}. Do not answer from training data.';
    case "stale_claim":
      return "Your answer sounds like stale training data about release timing or availability. Fetch current web evidence first, then answer with citations.";
    case "tool_failed":
      return "Your tool calls failed (missing url/query or denied). Fix the payload and retry — web.fetch needs url or query. Do not fall back to training data.";
    case "training_fallback":
      return "Do not answer from training data for time-sensitive facts. Fetch live evidence with web.fetch (url or query) and cite what you found.";
  }
}

export function shouldContinueAgentLoop(opts: {
  response: Pick<AgentResponse, "final" | "toolRequests">;
  rounds: number;
  maxRounds: number;
  requireToolEvidence?: boolean;
  hadSuccessfulToolResults: boolean;
  hadToolFailures?: boolean;
}): { continue: true; reason: AgentLoopNudgeReason } | { continue: false } {
  const { response, rounds, maxRounds, requireToolEvidence, hadSuccessfulToolResults, hadToolFailures } =
    opts;
  const toolRequests = response.toolRequests ?? [];

  if (toolRequests.length > 0) return { continue: false };
  if (rounds >= maxRounds) return { continue: false };

  if (isDeferredActionFinal(response.final)) {
    return { continue: true, reason: "deferred" };
  }

  if (response.final === null) {
    return { continue: true, reason: "no_tools" };
  }

  if (hadToolFailures && !hadSuccessfulToolResults) {
    return { continue: true, reason: "tool_failed" };
  }

  if (requireToolEvidence && !hadSuccessfulToolResults) {
    return { continue: true, reason: "no_tools" };
  }

  if (!hadSuccessfulToolResults && isStaleTemporalClaim(response.final)) {
    return { continue: true, reason: "stale_claim" };
  }

  if (!hadSuccessfulToolResults && isTrainingDataFallback(response.final)) {
    return { continue: true, reason: "training_fallback" };
  }

  return { continue: false };
}
