import { llmCall, MODEL_ROUTING } from "@hermes-os/llm-client";
import {
  RESEARCH_SECTION_HEADERS,
  withAssistantPolicy,
  looksLikeLeakedReasoning,
} from "@hermes-os/shared";
import type { ResearchBundle, ResearchRunOptions, ResearchRunPlan } from "./types.js";
import { formatResearchRunPlan } from "./research-planner.js";
import { formatEvidenceForPrompt } from "./citation-builder.js";
import {
  formatShoppingResearchFallback,
  isEmptyResearchAnswer,
} from "./shopping-fallback.js";

export type SynthesisInput = {
  plan: ResearchRunPlan;
  bundle: ResearchBundle;
  memoryContext: string;
  userQuery: string;
  options?: ResearchRunOptions;
};

function isShoppingQuery(text: string): boolean {
  return /\b(buy|best|recommend|cheap|deal|sale|price|product|amazon|shopping|link|url)\b/i.test(text);
}

export class SynthesisEngine {
  async synthesize(input: SynthesisInput): Promise<string> {
    const { plan, bundle, memoryContext, userQuery, options } = input;
    const shopping = isShoppingQuery(userQuery);
    const conversational =
      shopping ||
      /\b(twi+tter|x\.com|post next|tweet|what should i post)\b/i.test(userQuery);

    const baseSystem = options?.isFollowUp
      ? "Continue a research thread. Honor follow-ups. Cite retrieved evidence; do not invent URLs."
      : shopping
        ? "Shopping assistant for Hermes Personal OS. Use User memory silently — never ask the user to repeat preferences you already have. Lead with 2–3 sentences and concrete https:// links."
        : "Research analyst for Hermes Personal OS. Produce decision-grade output grounded in evidence below.";

    const sectionBlock = conversational
      ? "Reply in plain conversational chat text (1–4 sentences or short bullet ideas). No memorandum, no MEMORANDUM header, no numbered report sections."
      : `Required sections (use these headers): ${RESEARCH_SECTION_HEADERS.join(", ")}.
Under Evidence, reference citation numbers like [1], [2].
Under Risks, include counterarguments and source conflicts.
End with a concrete Recommended next action and What I would do.`;

    const system = withAssistantPolicy(
      [
        options?.system ?? baseSystem,
        "",
        `Current date: ${new Date().toISOString()}`,
        "Ground answers in retrieved evidence below. Do not rely on training-data release timelines if evidence conflicts.",
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
        sectionBlock,
        "",
        "User memory (apply silently):",
        memoryContext,
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );

    let answer = "";
    try {
      const res = await llmCall({
        model: MODEL_ROUTING.research_synthesis,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userQuery },
        ],
        max_tokens: conversational ? 512 : 2048,
        temperature: 0.3,
      });
      answer = res.content ?? "";
    } catch {
      answer = "";
    }

    if (isEmptyResearchAnswer(answer) || (shopping && looksLikeLeakedReasoning(answer))) {
      answer = formatShoppingResearchFallback(userQuery, bundle);
    }

    return answer;
  }
}
