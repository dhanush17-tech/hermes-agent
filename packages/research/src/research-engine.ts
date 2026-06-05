import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { ContextGraphService } from "@hermes-os/context-graph";
import {
  createGmailApiConnectorFromEnv,
  MacCalendarConnector,
  type GmailConnectorPort,
  type CalendarConnectorPort,
} from "@hermes-os/connectors";
import { InternalRetriever, type InternalRetrieverDeps } from "./internal-retriever.js";
import { retrieveWebSnippets } from "./web-retriever.js";
import { extractEvidenceFromSnippets, detectEvidenceConflicts } from "./evidence-extractor.js";
import { buildCitations } from "./citation-builder.js";
import { SynthesisEngine } from "./synthesis-engine.js";
import { createResearchRunPlan } from "./research-planner.js";
import { applySourceSelection } from "./source-selector.js";
import type {
  MemoryWriter,
  ResearchBundle,
  ResearchRunOptions,
  RetrievalSourceKind,
} from "./types.js";

export type ResearchEngineDeps = {
  cf: CloudflareWorkersAIClient;
  memory: MemoryWriter;
  workspaceRoot: string;
  contextGraph?: ContextGraphService | null;
  gmail?: GmailConnectorPort | null;
  calendar?: Pick<CalendarConnectorPort, "getToday" | "getUpcoming"> | null;
};

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
    this.synthesis = new SynthesisEngine(deps.cf);
  }

  async run(userQuery: string, options?: ResearchRunOptions): Promise<string> {
    const plan = applySourceSelection(createResearchRunPlan(userQuery));
    const bundle = await this.gatherEvidence(plan, options);
    const memoryContext = await this.deps.memory.formatContextForPrompt(
      options?.memoryTopic ?? userQuery,
      12,
    );

    const answer = await this.synthesis.synthesize({
      plan,
      bundle,
      memoryContext,
      userQuery,
      options,
    });

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
    const snippets = await this.internal.retrieve(plan, internalSources);

    if (selected.includes("web") && !options?.skipWeb) {
      snippets.push(...(await retrieveWebSnippets(plan.userQuestion, 4)));
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
