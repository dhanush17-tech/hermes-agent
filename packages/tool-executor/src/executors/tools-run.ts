import type { ToolContext, ToolResult } from "@hermes-os/shared";
import type { MacroRegistry } from "../macro-registry.js";
import type { ToolExecutor } from "../tool-executor.js";

export type ToolsRunPayload = {
  name?: string;
  payload?: unknown;
};

export async function executeToolsRun(
  payload: unknown,
  ctx: ToolContext,
  macros: MacroRegistry,
  executor: ToolExecutor,
): Promise<ToolResult> {
  const body = payload as ToolsRunPayload;
  const name = body.name?.trim();
  if (!name) return { status: "denied", reason: "name required" };

  const macro = macros.get(name);
  if (!macro) {
    return { status: "denied", reason: `macro not found: ${name}` };
  }

  const results: Array<{ tool: string; status: string; data?: unknown; reason?: string }> = [];

  for (const step of macro.steps) {
    const merged =
      body.payload && typeof body.payload === "object" ?
        { ...(step.payload as object), ...(body.payload as object) }
      : step.payload;

    const result = await executor.invoke(step.tool, merged, ctx, {
      summary: step.summary ?? `Macro ${name}: ${step.tool}`,
    });

    if (result.status === "pending_approval") {
      return {
        status: "pending_approval",
        approvalId: result.approvalId,
        message: `${result.message}\n(macro ${name} paused at ${step.tool})`,
      };
    }
    if (result.status === "denied") {
      results.push({ tool: step.tool, status: "denied", reason: result.reason });
      return {
        status: "denied",
        reason: `macro ${name} failed at ${step.tool}: ${result.reason}`,
      };
    }
    results.push({ tool: step.tool, status: "success", data: result.data });
  }

  return { status: "success", data: { macro: name, results } };
}
