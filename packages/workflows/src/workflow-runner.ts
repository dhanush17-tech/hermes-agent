import type { ToolContext } from "@hermes-os/shared";
import { WorkflowEngine, createDefaultWorkflowRegistry } from "./workflow-engine.js";

export type WorkflowToolInvoker = {
  invoke(tool: string, payload: Record<string, unknown>, ctx: ToolContext): Promise<{
    status: string;
    reason?: string;
    message?: string;
    data?: unknown;
  }>;
};

let engine: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engine) {
    engine = new WorkflowEngine(createDefaultWorkflowRegistry());
  }
  return engine;
}

export async function runWorkflowWithExecutor(
  workflowId: string,
  invoker: WorkflowToolInvoker,
  ctx: ToolContext,
  inputs: Record<string, unknown> = {},
): Promise<{ outputs: Record<string, unknown>; trace: string[]; failed?: string }> {
  const wf = getWorkflowEngine();
  try {
    return await wf.run(workflowId, {
      async invokeTool(tool, args) {
        const merged = { ...args, ...inputs };
        const result = await invoker.invoke(tool, merged, ctx);
        if (result.status === "denied") throw new Error(result.reason);
        if (result.status === "pending_approval") throw new Error(result.message);
        return result.data;
      },
    }, inputs);
  } catch (err) {
    return {
      outputs: {},
      trace: [],
      failed: err instanceof Error ? err.message : String(err),
    };
  }
}

export function formatWorkflowReply(
  workflowId: string,
  outputs: Record<string, unknown>,
  meta?: { email?: string; mode?: string },
): string {
  if (workflowId.startsWith("gmail.")) {
    return formatGmailReply(outputs, meta?.email ?? "Gmail", meta?.mode);
  }
  if (workflowId === "daily.morning_brief" || workflowId === "daily.evening_review") {
    const brief = outputs.brief as { text?: string } | string | undefined;
    if (typeof brief === "string") return brief;
    return brief?.text ?? "Brief complete.";
  }
  return JSON.stringify(outputs, null, 2).slice(0, 4000);
}

function formatGmailReply(
  outputs: Record<string, unknown>,
  accountEmail: string,
  mode?: string,
): string {
  const access = outputs.access as { mode?: string; email?: string } | undefined;
  const inbox = outputs.inbox ?? outputs.search ?? outputs.browserInbox;
  const loops = outputs.loops ?? outputs.openLoops;

  const prefix =
    mode === "api" || access?.mode === "api"
      ? `Using Gmail API for ${accountEmail}.`
      : access?.mode === "browser_logged_in"
        ? `Gmail API is not authorized for ${accountEmail}, so I used ${process.env.HERMES_PREFERRED_BROWSER ?? "Arc"} fallback.`
        : `Gmail (${accountEmail}):`;

  const lines = [prefix];

  const search = inbox as { count?: number; emails?: Array<{ from: string; subject: string }> } | undefined;
  if (search?.emails?.length) {
    lines.push(`Found ${search.emails.length} recent emails:`);
    lines.push(...search.emails.slice(0, 8).map((e) => `- ${e.from}: ${e.subject}`));
  } else if (typeof search?.count === "number") {
    lines.push(`${search.count} messages matched.`);
  }

  const summary = outputs.summarize as { summary?: string[] } | string[] | undefined;
  const summaryLines = Array.isArray(summary) ? summary : summary?.summary;
  if (summaryLines?.length) {
    lines.push("", "Summaries:", ...summaryLines.slice(0, 6));
  }

  const loopItems = Array.isArray(loops)
    ? loops
    : (loops as { openLoops?: Array<{ description: string }> })?.openLoops;
  if (loopItems?.length) {
    lines.push("", "Open loops:", ...loopItems.slice(0, 5).map((l) => `- ${l.description}`));
  }

  if (access?.mode === "browser_logged_in") {
    lines.push("", "Tip: authorize Gmail API for faster inbox checks next time.");
  }

  return lines.join("\n");
}
