import type { ResearchEvidence } from "./types.js";

export function buildCitations(evidence: ResearchEvidence[]): string {
  if (evidence.length === 0) return "(No retrieved sources — answer from general knowledge only if necessary.)";

  const lines = evidence.map((ev, i) => {
    const loc = ev.uri ?? ev.sourceId;
    return `[${i + 1}] (${ev.sourceKind}, conf ${Math.round(ev.confidence * 100)}%) ${ev.claim.slice(0, 120)} — ${loc}`;
  });

  return ["## Source citations", ...lines].join("\n");
}

export function formatEvidenceForPrompt(evidence: ResearchEvidence[]): string {
  if (evidence.length === 0) return "(No evidence snippets.)";
  return evidence
    .map(
      (ev, i) =>
        `### Evidence ${i + 1} [${ev.sourceKind}]\nClaim: ${ev.claim}\nExcerpt: ${ev.excerpt.slice(0, 450)}`,
    )
    .join("\n\n");
}
