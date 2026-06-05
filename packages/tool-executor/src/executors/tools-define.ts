import type { ToolResult } from "@hermes-os/shared";
import type { MacroRegistry, ToolMacro } from "../macro-registry.js";

export type ToolsDefinePayload = {
  name?: string;
  description?: string;
  steps?: Array<{ tool?: string; payload?: unknown; summary?: string }>;
};

export async function executeToolsDefine(
  payload: unknown,
  macros: MacroRegistry,
): Promise<ToolResult> {
  const body = payload as ToolsDefinePayload;
  const name = body.name?.trim();
  if (!name) return { status: "denied", reason: "name required" };
  if (!name.startsWith("custom.")) {
    return { status: "denied", reason: 'macro name must start with "custom."' };
  }
  if (!body.steps?.length) {
    return { status: "denied", reason: "steps required (array of {tool, payload})" };
  }

  const steps = body.steps.map((s) => ({
    tool: s.tool?.trim() ?? "",
    payload: s.payload ?? {},
    summary: s.summary,
  }));
  if (steps.some((s) => !s.tool)) {
    return { status: "denied", reason: "each step needs a tool name" };
  }

  const macro: ToolMacro = {
    name,
    description: body.description?.trim() ?? name,
    steps,
    createdAt: new Date().toISOString(),
  };

  const file = await macros.persist(macro);
  return {
    status: "success",
    data: { defined: name, file, stepCount: steps.length },
  };
}
