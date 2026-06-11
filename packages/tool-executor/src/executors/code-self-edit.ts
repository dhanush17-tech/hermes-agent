import { isAbsolute } from "node:path";
import type { ToolResult } from "@hermes-os/shared";
import { proposePatch, applyProposedPatch } from "@hermes-os/code-tools";

export type CodeSelfEditPayload = {
  instruction?: string;
  /** Full, complete new contents for each file to write. */
  files?: Array<{ path?: string; content?: string }>;
};

/** Paths the agent may never rewrite, even with explicit content. */
function isProtectedPath(rel: string): boolean {
  return (
    rel.includes("..") ||
    isAbsolute(rel) ||
    /(^|\/)\.env/.test(rel) ||
    /(^|\/)secrets\//.test(rel) ||
    /(^|\/)node_modules\//.test(rel) ||
    /(^|\/)\.git\//.test(rel)
  );
}

/**
 * Real code self-edit: the agent supplies complete new file contents and we
 * write them into the workspace through the checkpoint-backed patch pipeline
 * (so every edit is reversible via code.rollback). No external gateway needed.
 *
 * Loop the agent uses: filesystem.read (current content) → modify → code.self_edit
 * (full new content). For brand-new files just pass content with no prior read.
 */
export async function executeCodeSelfEdit(
  payload: unknown,
  workspaceRoot: string,
): Promise<ToolResult> {
  const body = payload as CodeSelfEditPayload;
  const instruction = body.instruction?.trim() || "self-edit";

  const files = (body.files ?? [])
    .filter((f) => f.path?.trim() && typeof f.content === "string")
    .map((f) => ({ path: f.path!.trim(), content: f.content as string }));

  if (!files.length) {
    return {
      status: "denied",
      reason:
        "code.self_edit needs files:[{path, content}] with the COMPLETE new contents of each file. " +
        "Read the file first (filesystem.read), apply your change to the full text, then pass it here.",
    };
  }

  for (const f of files) {
    if (isProtectedPath(f.path)) {
      return { status: "denied", reason: `Refusing to edit protected path: ${f.path}` };
    }
  }

  try {
    const patch = await proposePatch(workspaceRoot, { instruction, files });
    const result = await applyProposedPatch(workspaceRoot, patch.patchId);
    return {
      status: "success",
      data: {
        edited: true,
        instruction,
        applied: result.applied,
        checkpointId: result.checkpointId,
        rollbackHint: `To undo: code.rollback { checkpointId: "${result.checkpointId}" }`,
        nextStep: "Run code.run_tests to verify, then ask the user to `pnpm build` if needed.",
      },
    };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}
