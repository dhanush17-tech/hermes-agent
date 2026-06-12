import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HermesModelProvider, ToolResult } from "@hermes-os/shared";

export type CodeSelfEditPayload = {
  instruction?: string;
  request?: string;
  prompt?: string;
  task?: string;
  scope?: string;
};

function extractInstruction(payload: unknown): string {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const body = payload as CodeSelfEditPayload;
  return (
    body.instruction?.trim() ??
    body.request?.trim() ??
    body.prompt?.trim() ??
    body.task?.trim() ??
    ""
  );
}

export async function executeCodeSelfEdit(
  payload: unknown,
  workspaceRoot: string,
  hermes: HermesModelProvider | null,
): Promise<ToolResult> {
  const instruction = extractInstruction(payload);
  if (!instruction) {
    return {
      status: "denied",
      reason: "code.self_edit requires an edit instruction",
    };
  }

  if (hermes && (await hermes.healthCheck())) {
    try {
      const output = await hermes.chat(
        `You are editing the Hermes Personal OS monorepo at ${workspaceRoot}. Instruction:\n${instruction}\nApply changes via your tools. Summarize what you changed.`,
        { sessionKey: "hermes-personal-os-self-edit" },
      );
      return { status: "success", data: { edited: true, via: "hermes", output: output.slice(0, 8000) } };
    } catch (err) {
      return {
        status: "denied",
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const logDir = join(workspaceRoot, "data", "pending-edits");
  await mkdir(logDir, { recursive: true });
  const logFile = join(logDir, `edit-${Date.now()}.md`);
  await appendFile(logFile, `# Pending edit\n\n${instruction}\n`);
  return {
    status: "success",
    data: {
      edited: false,
      queued: true,
      logFile,
      hint: "Start Hermes gateway for live code edits",
    },
  };
}
