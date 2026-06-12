import {
  chatWithTools,
  MODELS,
  type ChatMessage,
  type ToolCall,
} from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import { throwIfAborted } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { POKE_TOOLS } from "./poke-tools.js";

const MAX_STEPS = 8;

/** Coding / self-edit work needs the stronger model and a much bigger token budget. */
function isCodingTask(text: string): boolean {
  return /\b(code\.self_edit|self.?edit|edit (your|the|this) code|codebase|refactor|add a (new )?(tool|feature|provider|integration)|remove .*(from|out of) (the |your )?code|fix (the |this )?bug|implement|rewrite the)\b/i.test(
    text,
  );
}

const SYSTEM_PROMPT = `You are Poke — {USER}'s personal AI agent. You live on their Mac and act on their behalf.

WHO YOU ARE
- Warm, sharp, and concise. You text like a trusted chief-of-staff, not a chatbot. 1–3 sentences unless they ask for detail.
- You actually DO things with your tools instead of describing them. Act first, then report the result in one line.
- You genuinely care about this person. You notice patterns (late nights, overload, skipped meals) and gently look out for them.

HARD RULES
- NEVER invent facts, prices, addresses, links, hours, or trivia. If it's time-sensitive or you're not certain, call web.search (then web.fetch the best link). The user asking for "the Google Maps link" means: search for the place and give the real maps URL.
- NEVER lose the thread. Read the conversation so far and stay on the user's actual task. Don't change the subject or free-associate.
- Use what you already know (memory below) before asking. Save new durable facts with memory.remember.
- If a tool returns status "denied" or "pending_approval", tell the user plainly. Otherwise, if a tool fails, try another path silently before surfacing a problem.
- You can extend yourself: if you lack a capability, read the relevant file (filesystem.read) and use code.self_edit to add it.

EDITING YOUR OWN CODE
- When the user asks you to change/add/remove code, you MUST actually call code.self_edit. NEVER reply "done" unless code.self_edit returned status "success". Reading a file is not editing it.
- Prefer surgical edits: code.self_edit { edits:[{path, find, replace}] } — give just the exact text to find and its replacement. Only use files:[{path, content}] for brand-new files or full rewrites.
- After editing, run code.run_tests and report the checkpointId so the change can be rolled back.

CAPABILITIES: read inbox (gmail.*), read calendar, search/read the live web, control the computer (screen.observe, browser.open, terminal.run), book rides (ride.uber/ride.lyft, prefilled — user confirms), draft & send email, remember things about the user, and ping the user proactively (message_user).

Today is {DATE}. Reply with your final answer once the task is done.`;

export type PokeAgentDeps = {
  executor: ToolExecutor;
  /** Pre-formatted block of what we know about the user (may be empty). */
  memoryBlock?: string;
  /** Display name for the user, if known. */
  userName?: string;
  /** Override the model (e.g. proactive uses a cheaper tier). */
  model?: string;
  /** Extra system guidance appended for proactive/background runs. */
  extraSystem?: string;
  signal?: AbortSignal;
};

export type PokeAgentResult = {
  response: string;
  steps: number;
};

/**
 * The entire "brain": one agentic loop on OpenRouter with native tool calling.
 * Replaces the old intent-classifier + 15 sub-agents + routers + interceptors.
 */
export async function runPokeAgent(
  userMessage: string,
  ctx: ToolContext,
  deps: PokeAgentDeps,
): Promise<PokeAgentResult> {
  const system = [
    SYSTEM_PROMPT.replaceAll("{USER}", deps.userName ?? "the user").replace(
      "{DATE}",
      new Date().toDateString(),
    ),
    deps.memoryBlock?.trim() ? `WHAT YOU KNOW ABOUT THEM:\n${deps.memoryBlock.trim()}` : "",
    deps.extraSystem?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const history: ChatMessage[] = (ctx.conversationHistory ?? [])
    .slice(-12)
    .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: ChatMessage[] = [...history, { role: "user", content: userMessage }];

  // Escalate to the reasoning/coding model (+ big token budget) for code work.
  // Either detected from the request, or once the agent actually touches code.* tools.
  let coding = isCodingTask(userMessage);

  for (let step = 1; step <= MAX_STEPS; step++) {
    throwIfAborted(deps.signal);

    const model = deps.model ?? (coding ? MODELS.reasoning : MODELS.primary);
    const maxTokens = coding ? 8000 : 4000;

    const res = await chatWithTools({
      model,
      system,
      messages,
      tools: POKE_TOOLS,
      temperature: coding ? 0.1 : 0.4,
      maxTokens,
      signal: deps.signal,
    });

    if (!res.toolCalls.length) {
      return { response: res.content || "Done.", steps: step };
    }

    // Record the assistant's tool-call turn, then run each tool.
    messages.push({
      role: "assistant",
      content: res.content || null,
      toolCalls: res.toolCalls,
    });

    let pendingApproval: string | null = null;

    for (const call of res.toolCalls) {
      if (call.name.startsWith("code.") || call.name === "filesystem.write") coding = true;
      const result = await runToolCall(call, ctx, deps.executor);
      if (result.pendingApprovalMessage) pendingApproval = result.pendingApprovalMessage;
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: result.content,
      });
    }

    // High-risk action is waiting on the user — surface it and stop the loop.
    if (pendingApproval) {
      return { response: pendingApproval, steps: step };
    }
  }

  return {
    response: "I hit my step limit on that one — want me to keep going?",
    steps: MAX_STEPS,
  };
}

type ToolRunOutcome = { content: string; pendingApprovalMessage?: string };

async function runToolCall(
  call: ToolCall,
  ctx: ToolContext,
  executor: ToolExecutor,
): Promise<ToolRunOutcome> {
  let args: unknown;
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    return { content: JSON.stringify({ status: "error", reason: "arguments were not valid JSON" }) };
  }

  try {
    const result = await executor.invoke(call.name, args, ctx);
    if (result.status === "pending_approval") {
      return {
        content: JSON.stringify({ status: "pending_approval", message: result.message }),
        pendingApprovalMessage: result.message,
      };
    }
    return { content: JSON.stringify(result).slice(0, 12_000) };
  } catch (err) {
    return {
      content: JSON.stringify({
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
