import {
  RESEARCH_SECTION_HEADERS,
  withAssistantPolicy,
  type CloudflareWorkersAIClient,
} from "@hermes-os/shared";
import type { ResearchBundle, ResearchRunOptions, ResearchRunPlan } from "./types.js";
import { formatResearchRunPlan } from "./research-planner.js";
import { buildCitations, formatEvidenceForPrompt } from "./citation-builder.js";

export type SynthesisInput = {
  plan: ResearchRunPlan;
  bundle: ResearchBundle;
  memoryContext: string;
  userQuery: string;
  options?: ResearchRunOptions;
};

export class SynthesisEngine {
  constructor(private readonly cf: CloudflareWorkersAIClient) {}

  async synthesize(input: SynthesisInput): Promise<string> {
    const { plan, bundle, memoryContext, userQuery, options } = input;
    const sections = RESEARCH_SECTION_HEADERS.join(", ");

    const baseSystem = options?.isFollowUp
      ? "Continue a research thread. Honor follow-ups. Cite retrieved evidence; do not invent URLs."
      : "Research analyst for Hermes Personal OS. Produce decision-grade output grounded in evidence below.";

    const system = withAssistantPolicy(
      [
        options?.system ?? baseSystem,
        "",
        formatResearchRunPlan(plan),
        "",
        bundle.citations,
        "",
        "Retrieved evidence:",
        formatEvidenceForPrompt(bundle.evidence),
        "",
        bundle.conflicts.length
          ? `Conflicts to address under Risks:\n${bundle.conflicts.map((c) => `- ${c}`).join("\n")}`
          : "",
        "",
        `Required sections (use these headers): ${sections}.`,
        "Under Evidence, reference citation numbers like [1], [2].",
        "Under Risks, include counterarguments and source conflicts.",
        "End with a concrete Recommended next action and What I would do.",
        "",
        "User memory (apply silently):",
        memoryContext,
      ].join("\n"),
    );

    const answer = await this.cf.chat(userQuery, {
      classification: "research",
      system,
      maxTokens: 2048,
    });

    return answer || "No response from Cloudflare Workers AI.";
  }
}
