/**
 * OpenRouter chat client with native (OpenAI-style) function/tool calling.
 *
 * This is the single cognitive backend for the poke agent. We use OpenRouter
 * because it exposes strong, cheap, tool-calling-capable models behind one
 * OpenAI-compatible endpoint, so the model is a config value (env), not code.
 *
 * Quality > Cloudflare Workers AI: small CF models hallucinate and fail at
 * structured tool calls. A mid model here (Gemini 2.5 Flash) costs a few cents
 * and reliably calls tools.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  /** Provider-assigned id, echoed back when we return the tool result. */
  id: string;
  name: string;
  /** Raw JSON string of arguments as produced by the model. */
  arguments: string;
};

export type ChatMessage = {
  role: ChatRole;
  content: string | null;
  /** assistant turns that requested tools */
  toolCalls?: ToolCall[];
  /** for role: "tool" — which call this answers */
  toolCallId?: string;
  /** optional tool/function name for role: "tool" */
  name?: string;
};

/** JSON-schema description of a tool the model may call. */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>;
};

export type ModelTier = "primary" | "reasoning" | "cheap";

/**
 * Model routing. Defaults chosen for cost/quality balance on a personal agent.
 * Override any of these with env vars without touching code.
 */
export const MODELS: Record<ModelTier, string> = {
  // Day-to-day chat + tool calling. Cheap, fast, reliable tool use.
  primary: process.env.LLM_PRIMARY_MODEL?.trim() || "google/gemini-2.5-flash",
  // Hard reasoning / coding / self-edits. Escalate only when needed.
  reasoning: process.env.LLM_REASONING_MODEL?.trim() || "anthropic/claude-sonnet-4.5",
  // Throwaway classification / extraction.
  cheap: process.env.LLM_CHEAP_MODEL?.trim() || "google/gemini-2.5-flash-lite",
};

/** Back-compat alias used around the codebase. */
export const MODEL_ROUTING = {
  primary_reasoning: MODELS.primary,
  deep_reasoning: MODELS.reasoning,
  research_synthesis: MODELS.reasoning,
  classification: MODELS.cheap,
  extraction: MODELS.cheap,
};

function baseUrl(): string {
  return process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1";
}

function apiKey(): string | null {
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(apiKey());
}

type WireMessage = {
  role: ChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
};

function toWire(messages: ChatMessage[]): WireMessage[] {
  return messages.map((m) => {
    const wire: WireMessage = { role: m.role, content: m.content };
    if (m.toolCalls?.length) {
      wire.tool_calls = m.toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.arguments },
      }));
    }
    if (m.toolCallId) wire.tool_call_id = m.toolCallId;
    if (m.name) wire.name = m.name;
    return wire;
  });
}

export type ChatInput = {
  model?: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none" | "required";
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type ChatResult = {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string;
};

type CompletionResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  error?: { message?: string };
};

/**
 * One model round-trip. Returns assistant text and any requested tool calls.
 * Caller runs the tools and feeds results back via role:"tool" messages.
 */
export async function chatWithTools(input: ChatInput): Promise<ChatResult> {
  const key = apiKey();
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env (get one at https://openrouter.ai/keys).",
    );
  }

  const messages: ChatMessage[] = input.system
    ? [{ role: "system", content: input.system }, ...input.messages]
    : input.messages;

  const body: Record<string, unknown> = {
    model: input.model || MODELS.primary,
    messages: toWire(messages),
    temperature: input.temperature ?? 0.4,
    max_tokens: input.maxTokens ?? 2048,
  };
  if (input.tools?.length) {
    body.tools = input.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = input.toolChoice ?? "auto";
  }

  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // OpenRouter attribution headers (optional but recommended).
      "HTTP-Referer": "https://github.com/hermes-personal-os",
      "X-Title": "Hermes Personal OS",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });

  const text = await res.text();
  let data: CompletionResponse;
  try {
    data = JSON.parse(text) as CompletionResponse;
  } catch {
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || data.error) {
    throw new Error(`OpenRouter ${res.status}: ${data.error?.message ?? text.slice(0, 300)}`);
  }

  const choice = data.choices?.[0];
  const msg = choice?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls ?? [])
    .filter((c) => c.function?.name)
    .map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function!.name!,
      arguments: c.function!.arguments ?? "{}",
    }));

  const content = (typeof msg?.content === "string" ? msg.content : "") || "";
  return {
    content: content.trim(),
    toolCalls,
    finishReason: choice?.finish_reason ?? "stop",
  };
}

/** Simple text completion (no tools) — for summaries, classification, etc. */
export async function chat(input: Omit<ChatInput, "tools" | "toolChoice">): Promise<string> {
  const result = await chatWithTools(input);
  return result.content;
}

export async function openRouterHealthCheck(): Promise<boolean> {
  if (!apiKey()) return false;
  try {
    await chat({
      model: MODELS.cheap,
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 5,
    });
    return true;
  } catch {
    return false;
  }
}
