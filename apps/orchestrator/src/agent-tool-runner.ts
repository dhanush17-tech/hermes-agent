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
    let payload = req.payload ?? {};

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
