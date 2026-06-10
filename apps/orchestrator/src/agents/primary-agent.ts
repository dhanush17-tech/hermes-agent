import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  llmStructured,
  MODELS,
  type AgentResponse,
  type ChatMessage,
  AGENT_RESPONSE_SCHEMA,
  validateAgentResponse,
  type SkillCandidate,
} from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { agentLoopNudge, shouldContinueAgentLoop } from "../agent-loop.js";
import { executeAgentToolRequests } from "../agent-tool-runner.js";
import { requiresLiveLookup } from "../live-lookup.js";

export { isDeferredActionFinal } from "../agent-loop.js";

const PRIMARY_SYSTEM_PROMPT = `You are Hermes — a personal OS assistant running on the user's laptop with full tool access.

You think fast and act first. Never announce what you're about to do — do it, then report the result.

CORE BEHAVIOR:
- Lead with the answer. If a tool is needed, call it silently and lead with the result.
- 1–3 sentences for most replies unless the user asked for detail, a list, or a document.
- Never say "I can't" unless a tool explicitly returned status: "denied" or "pending_approval".
- If a tool fails, replan silently. Try an alternate path before surfacing the problem.
- Never re-ask for facts that exist in the memory block above.
- Never invent Twitter handles, emails, or URLs — only use what's in memory or what tools return.
- If you're missing a capability, emit a code.self_edit toolRequest to add it.

TOOL PREFERENCE ORDER (always prefer higher on this list):
1. Direct API connectors (gmail.*, calendar.*)
2. web.fetch for structured data
3. browser.* CDP tools for interactive pages
4. screen.observe only for native desktop apps with no AX tree

OUTPUT: Return the agent_response JSON schema. toolRequests[] drives execution.
If final is set, the task is complete. If toolRequests[] is non-empty, the loop continues.

MEMORY CANDIDATES: If the user stated a fact, preference, or decision with confidence > 0.70,
include it in memoryCandidates[]. Types: durable_fact | preference | project_context | relationship_fact

WEATHER: For weather questions, call web.fetch on wttr.in for the user's location from memory — never guess from old cities.

LIVE FACTS: For prices, sales, availability, release dates, or anything time-sensitive — call web.fetch first. Never answer from training data.
web.fetch payload must include url (https://...) or query (search text). Never send an empty payload.`;

export type PrimaryAgentResult = AgentResponse & { response: string };

export async function runPrimaryAgent(
  userMessage: string,
  ctx: ToolContext,
  deps: {
    executor: ToolExecutor;
    workspaceRoot: string;
    memCtx: { systemBlock: string };
  },
): Promise<PrimaryAgentResult> {
  const systemPrompt = [
    PRIMARY_SYSTEM_PROMPT,
    deps.memCtx.systemBlock,
    `Current time: ${new Date().toISOString()}`,
    `User channel: ${ctx.channel ?? "cli"}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const history: ChatMessage[] = (ctx.conversationHistory ?? []).slice(-10).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  let rounds = 0;
  const MAX_ROUNDS = 8;
  let hadSuccessfulToolResults = false;
  let hadToolFailures = false;
  const liveLookup = requiresLiveLookup(userMessage);
  const allMemoryCandidates: AgentResponse["memoryCandidates"] = [];
  const allSkillCandidates: AgentResponse["skillCandidates"] = [];

  while (rounds < MAX_ROUNDS) {
    rounds++;

    const response = await llmStructured<AgentResponse>({
      model: MODELS.PRIMARY,
      schemaName: "agent_response",
      schema: AGENT_RESPONSE_SCHEMA,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
      validate: validateAgentResponse,
    });

    if (response.memoryCandidates?.length) {
      allMemoryCandidates.push(...response.memoryCandidates);
    }
    if (response.skillCandidates?.length) {
      allSkillCandidates.push(...response.skillCandidates);
    }

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
        await saveSkillCandidates(deps.workspaceRoot, allSkillCandidates);
        return {
          ...response,
          memoryCandidates: allMemoryCandidates,
          skillCandidates: allSkillCandidates,
          response: response.final,
        };
      }
    }

    const toolRound = await executeAgentToolRequests(toolRequests, ctx, deps.executor, {
      userMessage,
    });
    if (toolRound.pendingApprovalMessage) {
      await saveSkillCandidates(deps.workspaceRoot, allSkillCandidates);
      return {
        ...response,
        final: toolRound.pendingApprovalMessage,
        memoryCandidates: allMemoryCandidates,
        skillCandidates: allSkillCandidates,
        response: toolRound.pendingApprovalMessage,
      };
    }
    hadSuccessfulToolResults = hadSuccessfulToolResults || toolRound.hadSuccessfulToolResults;
    hadToolFailures = hadToolFailures || toolRound.hadToolFailures;

    messages.push({ role: "assistant", content: JSON.stringify(response) });
    messages.push(...toolRound.messages);
  }

  await saveSkillCandidates(deps.workspaceRoot, allSkillCandidates);
  const fallback = "I reached the maximum number of steps. Here is what I have so far.";
  return {
    final: fallback,
    toolRequests: [],
    memoryCandidates: allMemoryCandidates,
    skillCandidates: allSkillCandidates,
    reasoningSummary: "Hit max rounds limit",
    response: fallback,
  };
}

async function saveSkillCandidates(workspaceRoot: string, candidates: SkillCandidate[]): Promise<void> {
  if (!candidates.length) return;
  const dir = join(workspaceRoot, "data", "skill-candidates");
  await mkdir(dir, { recursive: true });
  for (const candidate of candidates) {
    const slug = candidate.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (!slug) continue;
    await writeFile(
      join(dir, `${slug}.json`),
      `${JSON.stringify({ ...candidate, status: "draft", createdAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  }
}
