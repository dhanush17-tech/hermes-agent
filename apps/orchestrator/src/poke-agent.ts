import {
  chatWithTools,
  MODELS,
  type ChatMessage,
  type ToolCall,
} from "@hermes-os/llm-client";
import { setTimeout as delay } from "node:timers/promises";
import type { ToolContext } from "@hermes-os/shared";
import { throwIfAborted } from "@hermes-os/shared";
import { SERVICE_URLS, type ToolExecutor } from "@hermes-os/tool-executor";
import { POKE_TOOLS } from "./poke-tools.js";

const MAX_STEPS = 8;

/** Coding / self-edit work needs the stronger model and a much bigger token budget. */
function isCodingTask(text: string): boolean {
  return /\b(code\.self_edit|self.?edit|edit (your|the|this) code|codebase|refactor|add a (new )?(tool|feature|provider|integration)|remove .*(from|out of) (the |your )?code|fix (the |this )?bug|implement|rewrite the)\b/i.test(
    text,
  );
}

function isSlackReadTask(text: string): boolean {
  return /\b(slack|channel|dm|direct message|visually)\b/i.test(text) &&
    /\b(read|what(?:'s| is| do)|latest|messages?|summarize|say|said|visually)\b/i.test(text);
}

function toolResultText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const data = (result as { data?: unknown }).data;
  if (!data || typeof data !== "object") return "";
  const visibleText = (data as { visibleText?: unknown }).visibleText;
  return typeof visibleText === "string" ? visibleText : "";
}

function isHermesSurface(text: string): boolean {
  return /\bHermes\b/i.test(text) &&
    /\b(Personal OS|Agent Activity|Ask Hermes|PokeAgent|screen\.read)\b/i.test(text);
}

const SYSTEM_PROMPT = `You are Poke — {USER}'s personal AI agent. You live on their Mac and act on their behalf.

WHO YOU ARE
- Warm, sharp, and concise. You text like a trusted chief-of-staff, not a chatbot. 1–3 sentences unless they ask for detail.
- You actually DO things with your tools instead of describing them. Act first, then report the result in one line.
- You genuinely care about this person. You notice patterns (late nights, overload, skipped meals) and gently look out for them.

HARD RULES
- NEVER invent facts, prices, addresses, links, hours, or trivia. If it's time-sensitive or you're not certain, call web.search (then web.fetch the best link). The user asking for "the Google Maps link" means: search for the place and give the real maps URL.
- NEVER answer questions about live app content (Slack messages, DMs, channels, browser pages, dashboards) from memory or prior conversation. You must use a fresh current-turn source: screen.read, browser.observe/browser.extract, or connection.request. If the fresh source fails or does not visibly show the requested content, say that plainly.
- NEVER lose the thread. Read the conversation so far and stay on the user's actual task. Don't change the subject or free-associate.
- Use what you already know (memory below) before asking. Save new durable facts with memory.remember.
- If a tool returns status "pending_approval", tell the user plainly. If a tool returns status "denied", try another available path first when one exists; only surface the denial after the fallback also fails.
- For service setup or account access (Slack, Gmail, Calendar, GitHub, Notion, etc.), OAuth/API connectors are optional. If connection.connect fails because no OAuth client is configured, use browser.goto for that service's web login and continue with screen observation. Do not claim you cannot help just because an API connector is unavailable.
- You can extend yourself: if you lack a capability, read the relevant file (filesystem.read) and use code.self_edit to add it.

EDITING YOUR OWN CODE
- When the user asks you to change/add/remove code, you MUST actually call code.self_edit. NEVER reply "done" unless code.self_edit returned status "success". Reading a file is not editing it.
- Prefer surgical edits: code.self_edit { edits:[{path, find, replace}] } — give just the exact text to find and its replacement. Only use files:[{path, content}] for brand-new files or full rewrites.
- After editing, run code.run_tests and report the checkpointId so the change can be rolled back.

CAPABILITIES: read inbox (gmail.*), read calendar, search/read the live web, control the computer (screen.observe, browser.goto/browser.open, terminal.run), book rides (ride.uber/ride.lyft, prefilled — user confirms), draft & send email, remember things about the user, and ping the user proactively (message_user).

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
  const recentContext = [...history.map((turn) => turn.content ?? ""), userMessage].join("\n");

  if (isSlackReadTask(recentContext)) {
    const focusSlack = await deps.executor.invoke("browser.goto", { url: SERVICE_URLS.slack }, ctx);
    if (focusSlack.status === "success") {
      await delay(2500, undefined, { signal: deps.signal });
    }
    const preflight = await deps.executor.invoke(
      "screen.read",
      { service: "slack", instruction: userMessage },
      ctx,
    );
    const preflightText = toolResultText(preflight);
    if (preflight.status === "denied" || isHermesSurface(preflightText)) {
      return {
        response:
          "I still captured Hermes instead of Slack. Bring the Slack window and the right channel/DM to the front, then ask again and I’ll read only what’s visible.",
        steps: 0,
      };
    }
    messages.push({
      role: "user",
      content: [
        "Fresh Slack foregrounding result:",
        JSON.stringify(focusSlack).slice(0, 2000),
        "Fresh Slack screen-read preflight result for the current user request:",
        JSON.stringify(preflight).slice(0, 12_000),
        "Answer only from this result or from another fresh tool result in this turn. If it is denied, still shows Hermes, or does not show the requested Slack messages, say you cannot see them and ask the user to bring Slack/channel into view.",
      ].join("\n"),
    });
  }

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

function noOAuthClientProvider(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { status?: string; reason?: string };
    if (parsed.status !== "denied" || !parsed.reason) return null;
    const match = parsed.reason.match(/\bNo OAuth client for ([a-z0-9_-]+)\b/i);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

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
    let content = JSON.stringify(result);
    let pendingApprovalMessage: string | undefined;
    const provider = call.name === "connection.connect" ? noOAuthClientProvider(content) : null;
    const fallbackUrl = provider ? SERVICE_URLS[provider] : null;
    if (fallbackUrl) {
      const fallback = await executor.invoke("browser.goto", { url: fallbackUrl }, ctx);
      if (fallback.status === "pending_approval") pendingApprovalMessage = fallback.message;
      content = JSON.stringify({
        ...result,
        fallback: {
          tool: "browser.goto",
          payload: { url: fallbackUrl },
          result: fallback,
          guidance:
            fallback.status === "success"
              ? "OAuth API setup is unavailable, but the service was opened in the user's normal browser. Continue with screen.observe, and ask the user to finish login if needed."
              : "OAuth API setup is unavailable and the browser fallback also failed. Now report the blocker plainly.",
        },
      });
    }
    return { content: content.slice(0, 12_000), pendingApprovalMessage };
  } catch (err) {
    return {
      content: JSON.stringify({
        status: "error",
        reason: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
