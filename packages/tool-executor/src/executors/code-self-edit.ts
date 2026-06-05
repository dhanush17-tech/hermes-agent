import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HermesModelProvider, ToolResult } from "@hermes-os/shared";

export type CodeSelfEditPayload = {
  instruction?: string;
  scope?: string;
};

export async function executeCodeSelfEdit(
  payload: unknown,
  workspaceRoot: string,
  hermes: HermesModelProvider | null,
): Promise<ToolResult> {
  const body = payload as CodeSelfEditPayload;
  const instruction = body.instruction?.trim();
  if (!instruction) return { status: "denied", reason: "instruction required" };

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
