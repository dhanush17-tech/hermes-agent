import type { CloudflareWorkersAIClient, ToolResult } from "@hermes-os/shared";
import type { MacroRegistry } from "../macro-registry.js";
import { executeToolsDefine } from "./tools-define.js";

export type ToolsAuthorPayload = {
  requirement?: string;
  name?: string;
};

export async function executeToolsAuthor(
  payload: unknown,
  macros: MacroRegistry,
  cf: CloudflareWorkersAIClient | null,
  catalog: string[],
): Promise<ToolResult> {
  const body = payload as ToolsAuthorPayload;
  const requirement = body.requirement?.trim();
  if (!requirement) return { status: "denied", reason: "requirement required" };

  if (!cf) {
    return {
      status: "denied",
      reason: "tools.author needs Cloudflare AI to draft a macro",
    };
  }

  const raw = await cf.chat(requirement, {
    maxTokens: 800,
    system: [
      "Design a reusable tool macro for Hermes Personal OS using ONLY existing built-in tools.",
      `Available tools: ${catalog.join(", ")}`,
      'Reply ONLY JSON: {"name":"custom.slug","description":"...","steps":[{"tool":"...","payload":{},"summary":"..."}]}',
      'Macro name MUST start with "custom.".',
      "Use screen.observe, browser.goto (Arc), terminal.run, filesystem.write, code.self_edit, memory.* as needed.",
      "No arbitrary code in steps — only tool calls.",
    ].join("\n"),
  });

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { status: "denied", reason: "author could not produce valid macro JSON" };
  }

  try {
    const draft = JSON.parse(raw.slice(start, end + 1)) as {
      name?: string;
      description?: string;
      steps?: Array<{ tool?: string; payload?: unknown; summary?: string }>;
    };
    const name = body.name?.trim() || draft.name;
    return executeToolsDefine(
      {
        name,
        description: draft.description ?? requirement,
        steps: draft.steps,
      },
      macros,
    );
  } catch {
    return { status: "denied", reason: "invalid macro JSON from author" };
  }
}
