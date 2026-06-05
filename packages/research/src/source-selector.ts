import type { ResearchPlan } from "@hermes-os/shared";
import type { RetrievalSourceKind, ResearchRunPlan } from "./types.js";

const SOURCE_MAP: Record<string, RetrievalSourceKind> = {
  memory: "memory",
  web: "web",
  email: "email",
  calendar: "calendar",
  local_files: "local_files",
  github: "github",
  browser: "web",
  social: "web",
};

/** Internal sources are always queried before web (connector-first research). */
export function selectResearchSources(plan: ResearchPlan): RetrievalSourceKind[] {
  const selected = new Set<RetrievalSourceKind>(["memory", "context_graph"]);

  for (const src of plan.sourcesNeeded) {
    const mapped = SOURCE_MAP[src];
    if (mapped && mapped !== "web") selected.add(mapped);
  }

  if (plan.sourcesNeeded.includes("web") || plan.freshnessRequirement === "current") {
    selected.add("web");
  }

  if (plan.outputFormat === "implementation_plan" || plan.outputFormat === "decision") {
    selected.add("local_files");
    selected.add("context_graph");
  }

  return orderSources([...selected]);
}

export function applySourceSelection(plan: ResearchRunPlan): ResearchRunPlan {
  return { ...plan, selectedSources: selectResearchSources(plan) };
}

function orderSources(sources: RetrievalSourceKind[]): RetrievalSourceKind[] {
  const order: RetrievalSourceKind[] = [
    "memory",
    "context_graph",
    "local_files",
    "email",
    "calendar",
    "github",
    "web",
  ];
  return order.filter((s) => sources.includes(s));
}
