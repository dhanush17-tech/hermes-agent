import type { ContextGraphService } from "@hermes-os/context-graph";
import {
  createGmailApiConnectorFromEnv,
  MacCalendarConnector,
  type GmailConnectorPort,
  type CalendarConnectorPort,
} from "@hermes-os/connectors";
import { InternalRetriever, type InternalRetrieverDeps } from "./internal-retriever.js";
import { retrieveWebSnippets } from "./web-retriever.js";
import { filterSnippetsByIntent } from "./source-policy.js";
import { extractEvidenceFromSnippets, detectEvidenceConflicts } from "./evidence-extractor.js";
import { buildCitations } from "./citation-builder.js";
import { SynthesisEngine } from "./synthesis-engine.js";
import { createResearchRunPlan } from "./research-planner.js";
import { applySourceSelection } from "./source-selector.js";
import { shoppingMemoryTopic } from "./shopping-fallback.js";
import type {
  MemoryWriter,
  ResearchBundle,
  ResearchRunOptions,
  RetrievalSourceKind,
} from "./types.js";

export type ResearchEngineDeps = {
  memory: MemoryWriter;
  workspaceRoot: string;
  contextGraph?: ContextGraphService | null;
  gmail?: GmailConnectorPort | null;
  calendar?: Pick<CalendarConnectorPort, "getToday" | "getUpcoming"> | null;
};

function isProductRecommendationQuery(text: string): boolean {
  return /\b(buy|best|recommend|cheap|deal|sale|price|product|amazon|shopping|vs|compare)\b/i.test(text);
}

export class ResearchEngine {
  private readonly internal: InternalRetriever;
  private readonly synthesis: SynthesisEngine;

  constructor(private readonly deps: ResearchEngineDeps) {
    const internalDeps: InternalRetrieverDeps = {
      memory: deps.memory,
      workspaceRoot: deps.workspaceRoot,
      contextGraph: deps.contextGraph ?? null,
      gmail: deps.gmail ?? createGmailApiConnectorFromEnv(),
      calendar:
        deps.calendar ??
        (process.platform === "darwin" ? new MacCalendarConnector() : null),
    };
    this.internal = new InternalRetriever(internalDeps);
    this.synthesis = new SynthesisEngine();
  }

  async run(userQuery: string, options?: ResearchRunOptions): Promise<string> {
    const plan = applySourceSelection(createResearchRunPlan(userQuery));
    const bundle = await this.gatherEvidence(plan, options);
    const memoryTopic = shoppingMemoryTopic(userQuery, options?.memoryTopic);
    const memoryContext = await this.deps.memory.formatContextForPrompt(memoryTopic, 12);

    let answer = await this.synthesis.synthesize({
      plan,
      bundle,
      memoryContext,
      userQuery,
      options: { ...options, memoryTopic },
    });

    if (isLowQualityResearchAnswer(answer)) {
      answer = [
        answer.trim(),
        "",
        "Confidence: low — web retrieval had limited evidence.",
        "Assumptions: based on available snippets only.",
        bundle.evidence.length
          ? `Evidence: ${bundle.evidence.slice(0, 3).map((e) => e.claim).join("; ")}`
          : "Recommended next action: refine the question or retry with Arc browser open.",
      ]
        .filter(Boolean)
        .join("\n");
    }

    if (!options?.skipMemoryWrite) {
      await this.maybePersistResearchMemory(userQuery, answer, bundle).catch(() => undefined);
    }

    return answer;
  }

  async gatherEvidence(
    plan: ReturnType<typeof applySourceSelection>,
    options?: ResearchRunOptions,
  ): Promise<ResearchBundle> {
    const selected = plan.selectedSources;
    const internalSources = selected.filter((s) => s !== "web") as RetrievalSourceKind[];
    let snippets = await this.internal.retrieve(plan, internalSources);

    if (selected.includes("web") && !options?.skipWeb) {
      snippets.push(...(await retrieveWebSnippets(plan.userQuestion, 4)));
    }

    if (isProductRecommendationQuery(plan.userQuestion) && plan.outputFormat !== "implementation_plan") {
      snippets = filterSnippetsByIntent(snippets, "product_recommendation");
    } else {
      snippets = filterSnippetsByIntent(snippets, "technical_research");
    }

    const evidence = extractEvidenceFromSnippets(snippets);
    const conflicts = detectEvidenceConflicts(evidence);

    return {
      plan,
      snippets,
      evidence,
      citations: buildCitations(evidence),
      conflicts,
    };
  }

  private async maybePersistResearchMemory(
    question: string,
    answer: string,
    bundle: ResearchBundle,
  ): Promise<void> {
    if (/\b(link|links|url|buy|purchase|order|amazon|price|recommend me|what should i get|best .{0,40}(?:for|to buy))\b/i.test(question)) {
      return;
    }

    const durable =
      bundle.plan.researchType === "implementation_plan" ||
      bundle.plan.researchType === "decision_analysis" ||
      bundle.plan.outputFormat === "decision";

    if (!durable) return;
    if (!/\b(Recommendation|Answer)\b/i.test(answer)) return;

    const citationSummary = bundle.evidence
      .slice(0, 4)
      .map((e, i) => `[${i + 1}] ${e.sourceKind}`)
      .join(", ");

    await this.deps.memory.remember({
      content: `Research (${new Date().toISOString().slice(0, 10)}): ${question.slice(0, 160)} — ${answer.slice(0, 400)}`,
      memoryType: "decision",
      source: "research_engine",
      evidence: citationSummary || undefined,
    });
  }
}

export function createResearchEngine(deps: ResearchEngineDeps): ResearchEngine {
  return new ResearchEngine(deps);
}

function isLowQualityResearchAnswer(answer: string): boolean {
  const t = answer.trim();
  if (!t) return true;
  if (/^No response from (?:Cloudflare Workers AI|OpenRouter)\.?$/i.test(t)) return true;
  if (/^Links for "/i.test(t)) return true;
  const links = t.match(/https?:\/\/[^\s)]+/g) ?? [];
  const searchOnly =
    links.length > 0 && links.every((u) => /\/s\?k=|google\.com\/search|amazon\.com\/s\?/i.test(u));
  return searchOnly;
}
