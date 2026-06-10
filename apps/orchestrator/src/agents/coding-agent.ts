import { llmCall, llmStructured, MODELS, AGENT_RESPONSE_SCHEMA, validateAgentResponse, type ChatMessage } from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";

const CODING_SYSTEM_PROMPT = `You are a senior TypeScript engineer working inside the Hermes Personal OS monorepo.

WORKSPACE: The monorepo root is at process.env.HERMES_WORKSPACE_ROOT or the user's workspaceRoot.
You have access to code.self_edit to read and modify files directly.

APPROACH:
- Read relevant files before proposing changes
- Propose minimal, targeted diffs
- Run tests after applying patches when possible
- Use toolRequests for code.propose_patch and code.run_tests

NEVER auto-apply changes that modify packages/policies/, packages/approval-broker/, delete files, or change .env without approval flow.`;

export async function runCodingAgent(
  instruction: string,
  ctx: ToolContext,
  deps: { executor: ToolExecutor; memCtx: { systemBlock: string } },
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [CODING_SYSTEM_PROMPT, deps.memCtx.systemBlock, `Workspace: ${ctx.workspaceRoot}`].join("\n\n"),
    },
    { role: "user", content: instruction },
  ];

  let rounds = 0;
  while (rounds < 8) {
    rounds++;
    const response = await llmStructured({
      model: MODELS.PRIMARY,
      schemaName: "agent_response",
      schema: AGENT_RESPONSE_SCHEMA,
      messages,
      temperature: 0.2,
      max_tokens: 3000,
      validate: validateAgentResponse,
    });

    if (response.final !== null || !response.toolRequests?.length) {
      return response.final ?? "Coding task complete.";
    }

    for (const req of response.toolRequests) {
      const result = await deps.executor.invoke(req.tool, req.payload ?? {}, ctx, {
        summary: req.reason ?? req.tool,
      });
      if (result.status === "pending_approval") return result.message;
      messages.push(
        { role: "assistant", content: JSON.stringify(response) },
        { role: "user", content: `Tool result (${req.tool}): ${JSON.stringify(result)}` },
      );
    }
  }

  return "Reached max coding rounds without finishing.";
}

const WRITING_SYSTEM_PROMPT = `You are the Hermes message writer. Draft polished, human-sounding copy.

OUTPUT: Return ONLY the message body. No JSON. No preamble. No "Here's a draft:".
Just the message itself.

RULES:
- Match the channel tone: iMessage = casual + warm. Email = professional but not stiff.
- Lead with the most important thing.
- Never use filler phrases ("I hope this finds you well", "Please don't hesitate").
- If drafting for the user to send, write in first person as if you are them.`;

export async function runWritingAgent(
  request: string,
  memCtx: { systemBlock: string },
): Promise<string> {
  const res = await llmCall({
    model: MODELS.FAST,
    temperature: 0.6,
    max_tokens: 512,
    messages: [
      { role: "system", content: [WRITING_SYSTEM_PROMPT, memCtx.systemBlock].filter(Boolean).join("\n\n") },
      { role: "user", content: request },
    ],
  });

  return res.content ?? "";
}
