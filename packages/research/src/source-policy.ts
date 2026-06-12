import type { RetrievedSnippet, RetrievalSourceKind } from "./types.js";

export type ResearchFilterIntent =
  | "product_recommendation"
  | "technical_research"
  | "company_research"
  | "person_research"
  | "personal_context_question"
  | "email_summary";

const DENIED_URL_PATTERNS = [
  /slack\.com/i,
  /zelle/i,
  /security.?alert/i,
  /phishing/i,
  /mail\.google\.com/i,
  /calendar\.google/i,
];

const ALLOWED_BY_INTENT: Record<string, Set<RetrievalSourceKind>> = {
  product_recommendation: new Set(["web", "memory"]),
  technical_research: new Set(["web", "memory", "context_graph", "local_files", "github"]),
  company_research: new Set(["web", "memory", "context_graph"]),
  person_research: new Set(["web", "memory", "context_graph"]),
  personal_context_question: new Set(["memory", "context_graph", "email", "calendar"]),
  email_summary: new Set(["email", "memory"]),
};

export function isDeniedSource(
  url: string | undefined,
  sourceKind: RetrievalSourceKind,
  intent: ResearchFilterIntent,
): boolean {
  if (url && DENIED_URL_PATTERNS.some((re) => re.test(url))) return true;

  if (intent === "product_recommendation") {
    if (sourceKind === "email" || sourceKind === "calendar") return true;
    if (sourceKind === "local_files") return true;
    if (url && /slack|zelle|security/i.test(url)) return true;
  }

  return false;
}

export function filterSnippetsByIntent(
  snippets: RetrievedSnippet[],
  intent: ResearchFilterIntent,
): RetrievedSnippet[] {
  const allowed = ALLOWED_BY_INTENT[intent];
  return snippets.filter((s) => {
    if (allowed && !allowed.has(s.sourceKind)) return false;
    if (isDeniedSource(s.uri, s.sourceKind, intent)) return false;
    if (intent === "product_recommendation" && s.sourceKind === "memory") {
      const excerpt = `${s.title} ${s.excerpt}`.toLowerCase();
      if (/slack|zelle|security alert|calendar|email/i.test(excerpt)) return false;
    }
    return true;
  });
}

export function filterEvidenceText(text: string, intent: ResearchFilterIntent): boolean {
  if (intent !== "product_recommendation") return true;
  return !DENIED_URL_PATTERNS.some((re) => re.test(text));
}
