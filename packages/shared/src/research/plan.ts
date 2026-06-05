import type { ResearchFreshness, ResearchOutputFormat, ResearchPlan, SourceType } from "./types.js";

export function inferResearchSources(question: string): SourceType[] {
  const sources = new Set<SourceType>(["memory", "web"]);
  if (/\b(email|inbox|gmail|reply|thread|investor|founder)\b/i.test(question)) {
    sources.add("email");
  }
  if (/\b(calendar|meeting|schedule|tomorrow|today)\b/i.test(question)) {
    sources.add("calendar");
  }
  if (/\b(file|doc|deck|spec|folder|readme)\b/i.test(question)) {
    sources.add("local_files");
  }
  if (/\b(github|pr|commit|repo|issue)\b/i.test(question)) {
    sources.add("github");
  }
  if (/\b(browser|tab|website|competitor)\b/i.test(question)) {
    sources.add("browser");
  }
  if (/\b(tweet|linkedin|x\.com|post|social)\b/i.test(question)) {
    sources.add("social");
  }
  return [...sources];
}

export function decomposeResearchQuestions(question: string): string[] {
  const trimmed = question.trim();
  const parts = trimmed
    .split(/\?+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 8);
  if (parts.length > 1) return parts.map((p) => `${p}?`);
  return [
    `What is the core question behind: ${trimmed}?`,
    `What evidence exists internally (memory, files, email) for: ${trimmed}?`,
    `What does the external market/web say about: ${trimmed}?`,
    `What are tradeoffs and risks for: ${trimmed}?`,
    `What is the recommended next action for: ${trimmed}?`,
  ];
}

export function inferResearchOutputFormat(question: string): ResearchOutputFormat {
  if (/\b(implement|implementation|build|architecture|how to ship|roadmap|steps)\b/i.test(question)) {
    return "implementation_plan";
  }
  if (/\b(compare|vs|should we|whether|best way|positioning|strategy)\b/i.test(question)) {
    return "decision";
  }
  if (/\b(summarize|overview|brief|tl;dr)\b/i.test(question)) {
    return "brief";
  }
  return "memo";
}

export function inferResearchFreshness(question: string): ResearchFreshness {
  if (/\b(today|current|latest|2025|2026|now|trend|news)\b/i.test(question)) {
    return "current";
  }
  if (/\b(history|historical|origin|evolution)\b/i.test(question)) {
    return "historical";
  }
  return "stable";
}

export function buildResearchPlan(userQuestion: string): ResearchPlan {
  return {
    userQuestion: userQuestion.trim(),
    subQuestions: decomposeResearchQuestions(userQuestion),
    sourcesNeeded: inferResearchSources(userQuestion),
    freshnessRequirement: inferResearchFreshness(userQuestion),
    outputFormat: inferResearchOutputFormat(userQuestion),
  };
}

export function formatResearchPlanForPrompt(plan: ResearchPlan): string {
  return [
    "## Research plan",
    `Question: ${plan.userQuestion}`,
    `Output: ${plan.outputFormat}`,
    `Freshness: ${plan.freshnessRequirement}`,
    `Sources: ${plan.sourcesNeeded.join(", ")}`,
    "Sub-questions:",
    ...plan.subQuestions.map((q, i) => `${i + 1}. ${q}`),
  ].join("\n");
}
