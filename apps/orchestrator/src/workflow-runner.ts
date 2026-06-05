import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolContext } from "@hermes-os/shared";
import {
  createDefaultWorkflowRegistry,
  WorkflowEngine,
} from "@hermes-os/workflows";

let engine: WorkflowEngine | null = null;

export function getWorkflowEngine(): WorkflowEngine {
  if (!engine) {
    engine = new WorkflowEngine(createDefaultWorkflowRegistry());
  }
  return engine;
}

export async function runWorkflow(
  workflowId: string,
  executor: ToolExecutor,
  ctx: ToolContext,
  inputs: Record<string, unknown> = {},
): Promise<{ outputs: Record<string, unknown>; trace: string[]; failed?: string }> {
  const wf = getWorkflowEngine();
  try {
    return await wf.run(workflowId, {
      async invokeTool(tool, args) {
        const merged = { ...args, ...inputs };
        const result = await executor.invoke(tool, merged, ctx, { summary: `workflow:${workflowId}:${tool}` });
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

export function formatGmailWorkflowReply(
  outputs: Record<string, unknown>,
  accountEmail: string,
): string {
  const search = outputs.search as { count?: number; emails?: Array<{ from: string; subject: string }> } | undefined;
  const summary = outputs.summarize as { summary?: string[] } | string[] | undefined;
  const loops = outputs.loops as { openLoops?: Array<{ description: string }> } | Array<{ description: string }> | undefined;

  const lines = [`Gmail (${accountEmail}) — inbox check:`];
  if (search?.emails?.length) {
    lines.push(...search.emails.slice(0, 8).map((e) => `- ${e.from}: ${e.subject}`));
  } else if (typeof search?.count === "number") {
    lines.push(`${search.count} messages matched.`);
  }
  const summaryLines = Array.isArray(summary) ? summary : summary?.summary;
  if (summaryLines?.length) {
    lines.push("", "Summaries:", ...summaryLines.slice(0, 6));
  }
  const loopItems = Array.isArray(loops) ? loops : loops?.openLoops;
  if (loopItems?.length) {
    lines.push("", "Open loops:", ...loopItems.slice(0, 5).map((l) => `- ${l.description}`));
  }
  return lines.join("\n");
}
