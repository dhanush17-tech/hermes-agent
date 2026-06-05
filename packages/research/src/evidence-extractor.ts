import { generateId } from "@hermes-os/shared";
import type { ResearchEvidence, RetrievedSnippet } from "./types.js";

export function extractEvidenceFromSnippets(snippets: RetrievedSnippet[]): ResearchEvidence[] {
  return snippets.map((s) => ({
    id: generateId("ev"),
    claim: inferClaim(s),
    excerpt: s.excerpt.slice(0, 500),
    sourceKind: s.sourceKind,
    sourceId: s.sourceId,
    uri: s.uri,
    confidence: confidenceForSource(s.sourceKind),
  }));
}

function inferClaim(snippet: RetrievedSnippet): string {
  const firstLine = snippet.excerpt.split("\n")[0]?.trim() ?? snippet.title;
  return `${snippet.title}: ${firstLine}`.slice(0, 200);
}

function confidenceForSource(kind: RetrievedSnippet["sourceKind"]): number {
  switch (kind) {
    case "memory":
    case "context_graph":
    case "local_files":
      return 0.85;
    case "email":
    case "calendar":
      return 0.8;
    case "github":
      return 0.75;
    case "web":
      return 0.65;
    default:
      return 0.6;
  }
}

export function detectEvidenceConflicts(evidence: ResearchEvidence[]): string[] {
  const conflicts: string[] = [];
  const byTopic = new Map<string, ResearchEvidence[]>();

  for (const ev of evidence) {
    const key = ev.sourceKind;
    const list = byTopic.get(key) ?? [];
    list.push(ev);
    byTopic.set(key, list);
  }

  const web = evidence.filter((e) => e.sourceKind === "web");
  const internal = evidence.filter((e) => e.sourceKind !== "web");
  if (web.length && internal.length) {
    const hasContradiction =
      /\b(not|never|avoid|deprecated|fails|wrong)\b/i.test(web.map((w) => w.excerpt).join(" ")) &&
      /\b(should|recommend|best|prefer|use)\b/i.test(internal.map((i) => i.excerpt).join(" "));
    if (hasContradiction) {
      conflicts.push("Web results may conflict with internal project context — verify before acting.");
    }
  }

  if (evidence.length === 0) {
    conflicts.push("No grounded evidence retrieved — treat conclusions as low confidence.");
  }

  return conflicts;
}
