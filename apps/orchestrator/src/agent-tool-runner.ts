import type { ToolRequest } from "@hermes-os/llm-client";
import type { ChatMessage } from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import { normalizeWebFetchPayload, type ToolExecutor } from "@hermes-os/tool-executor";

export type ToolRoundResult = {
  messages: ChatMessage[];
  hadSuccessfulToolResults: boolean;
  hadToolFailures: boolean;
  pendingApprovalMessage?: string;
};

function toolRequestKey(req: ToolRequest): string {
  return `${req.tool}:${JSON.stringify(req.payload ?? {})}`;
}

function payloadInstruction(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";
  const body = payload as {
    instruction?: unknown;
    request?: unknown;
    prompt?: unknown;
    task?: unknown;
  };
  for (const value of [body.instruction, body.request, body.prompt, body.task]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function looksLikeEditInstruction(text: string | undefined): text is string {
  if (!text?.trim()) return false;
  return /\b(fix|implement|change|update|modify|edit|patch|refactor|debug|build|test|add|remove)\b/i.test(text);
}

function normalizeCodeSelfEditPayload(
  payload: unknown,
  req: ToolRequest,
  userMessage: string | undefined,
): unknown {
  if (payloadInstruction(payload)) return payload;

  const fallback = looksLikeEditInstruction(req.reason)
    ? req.reason.trim()
    : looksLikeEditInstruction(userMessage)
      ? userMessage.trim()
      : "";

  if (!fallback) return payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { instruction: fallback };
  }
  return { ...(payload as Record<string, unknown>), instruction: fallback };
}

export function dedupeToolRequests(requests: ToolRequest[], maxPerRound = 2): ToolRequest[] {
  const seen = new Set<string>();
  const out: ToolRequest[] = [];
  for (const req of requests) {
    const key = toolRequestKey(req);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(req);
    if (out.length >= maxPerRound) break;
  }
  return out;
}

export async function executeAgentToolRequests(
  requests: ToolRequest[],
  ctx: ToolContext,
  executor: ToolExecutor,
  opts: { userMessage?: string; maxPerRound?: number } = {},
): Promise<ToolRoundResult> {
  const deduped = dedupeToolRequests(requests, opts.maxPerRound ?? 2);
  const messages: ChatMessage[] = [];
  let hadSuccessfulToolResults = false;
  let hadToolFailures = false;

  for (const req of deduped) {
    let payload: unknown = req.payload ?? {};

    if (req.tool === "web.fetch") {
      const normalized = normalizeWebFetchPayload(
        payload as Record<string, unknown>,
        opts.userMessage,
      );
      if (!normalized.ok) {
        hadToolFailures = true;
        messages.push({
          role: "user",
          content: `Tool result (${req.tool}): ${JSON.stringify({ status: "denied", reason: normalized.reason })}`,
        });
        continue;
      }
      payload = { url: normalized.url };
    }

    if (req.tool === "code.self_edit") {
      payload = normalizeCodeSelfEditPayload(payload, req, opts.userMessage);
    }

    const result = await executor.invoke(req.tool, payload, ctx, {
      summary: req.reason ?? req.tool,
    });

    if (result.status === "pending_approval") {
      return {
        messages,
        hadSuccessfulToolResults,
        hadToolFailures,
        pendingApprovalMessage: result.message,
      };
    }

    if (result.status === "success") {
      hadSuccessfulToolResults = true;
    } else {
      hadToolFailures = true;
    }

    messages.push({
      role: "user",
      content: `Tool result (${req.tool}): ${JSON.stringify(result)}`,
    });
  }

  return { messages, hadSuccessfulToolResults, hadToolFailures };
}
