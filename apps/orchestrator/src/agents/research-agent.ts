import {
  llmStructured,
  MODELS,
  AGENT_RESPONSE_SCHEMA,
  validateAgentResponse,
  type AgentResponse,
  type ChatMessage,
} from "@hermes-os/llm-client";
import { createResearchEngine } from "@hermes-os/research";
import type { MemoryService } from "@hermes-os/memory";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { agentLoopNudge, shouldContinueAgentLoop } from "../agent-loop.js";
import { executeAgentToolRequests } from "../agent-tool-runner.js";
import { requiresLiveLookup } from "../live-lookup.js";

const RESEARCH_SYSTEM_PROMPT = `You are the Hermes research engine. Gather evidence and synthesize decision-grade answers.

BEHAVIOR:
- Plan sub-questions before searching. Maximum 2 web fetches per round.
- Cite sources inline. Never invent URLs.
- For shopping/product/price queries: lead with 2–3 sentences + direct product URLs (not search pages).
- For prices, sales, availability, or release status: you MUST web.fetch current evidence — never answer from training data or memory alone.
- Memory is for user preferences only, not for product facts that change over time.
- web.fetch payload must include url (https://...) or query (search text). Never send an empty payload.

OUTPUT: Return agent_response JSON. Use toolRequests with web.fetch for evidence. Set final only after you have tool results.`;

export async function runResearchAgent(
  query: string,
  ctx: ToolContext,
  deps: {
    executor: ToolExecutor;
    memCtx: { systemBlock: string };
    memoryService?: MemoryService;
    workspaceRoot?: string;
  },
): Promise<AgentResponse & { response: string }> {
  if (requiresLiveLookup(query) && deps.memoryService && deps.workspaceRoot) {
    const engine = createResearchEngine({
      memory: deps.memoryService,
      workspaceRoot: deps.workspaceRoot,
    });
    const answer = await engine.run(query, { skipMemoryWrite: true });
    return {
      final: answer,
      toolRequests: [],
      memoryCandidates: [],
      skillCandidates: [],
      reasoningSummary: "ResearchEngine live lookup",
      response: answer,
    };
  }

  const isShoppingQuery = /\b(buy|best|recommend|cheap|deal|sale|price|vs|compare)\b/i.test(query);
  const liveLookup = requiresLiveLookup(query);

  const systemPrompt = [
    RESEARCH_SYSTEM_PROMPT,
    deps.memCtx.systemBlock,
    `Current date: ${new Date().toISOString()}`,
    `Query type: ${isShoppingQuery ? "shopping" : "research"}`,
    liveLookup ? "LIVE LOOKUP REQUIRED: fetch web evidence before answering." : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: query },
  ];

  const MAX_ROUNDS = 5;
  let rounds = 0;
  let hadSuccessfulToolResults = false;
  let hadToolFailures = false;

  while (rounds < MAX_ROUNDS) {
    rounds++;
    const model =
      rounds === MAX_ROUNDS ? (process.env.HERMES_RESEARCH_FALLBACK_MODEL ?? MODELS.PRIMARY) : MODELS.PRIMARY;

    const response = await llmStructured({
      model,
      schemaName: "agent_response",
      schema: AGENT_RESPONSE_SCHEMA,
      messages,
      temperature: 0.2,
      max_tokens: 3000,
      validate: validateAgentResponse,
    });

    const toolRequests = response.toolRequests ?? [];
    if (!toolRequests.length) {
      const loop = shouldContinueAgentLoop({
        response,
        rounds,
        maxRounds: MAX_ROUNDS,
        requireToolEvidence: liveLookup,
        hadSuccessfulToolResults,
        hadToolFailures,
      });
      if (loop.continue) {
        messages.push({ role: "assistant", content: JSON.stringify(response) });
        messages.push({ role: "user", content: agentLoopNudge(loop.reason) });
        continue;
      }

      if (response.final !== null) {
        return {
          ...response,
          response: response.final,
        };
      }
    }

    const toolRound = await executeAgentToolRequests(toolRequests, ctx, deps.executor, {
      userMessage: query,
    });
    hadSuccessfulToolResults = hadSuccessfulToolResults || toolRound.hadSuccessfulToolResults;
    hadToolFailures = hadToolFailures || toolRound.hadToolFailures;

    messages.push({ role: "assistant", content: JSON.stringify(response) });
    messages.push(...toolRound.messages);
  }

  const fallback = "Research incomplete — max rounds reached.";
  return {
    final: fallback,
    toolRequests: [],
    memoryCandidates: [],
    skillCandidates: [],
    reasoningSummary: "",
    response: fallback,
  };
}
