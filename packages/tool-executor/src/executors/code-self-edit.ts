import { isAbsolute, resolve, relative } from "node:path";
import { readFileSync } from "node:fs";
import type { ToolResult } from "@hermes-os/shared";
import { proposePatch, applyProposedPatch } from "@hermes-os/code-tools";

export type CodeSelfEditPayload = {
  instruction?: string;
  /** Full-file mode: complete new contents for each file to write. */
  files?: Array<{ path?: string; content?: string }>;
  /**
   * Surgical mode (preferred for small changes): find/replace edits applied to
   * existing files. Avoids re-emitting whole files, so it's reliable and cheap.
   */
  edits?: Array<{ path?: string; find?: string; replace?: string; replaceAll?: boolean }>;
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

function readWithinRoot(root: string, rel: string): string | null {
  const abs = resolve(root, rel);
  const back = relative(root, abs);
  if (back.startsWith("..") || isAbsolute(back)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/**
 * Apply surgical find/replace edits, producing the full new contents per file.
 * Returns an error string if any find target is missing (so the agent can fix).
 */
function applyEdits(
  root: string,
  edits: NonNullable<CodeSelfEditPayload["edits"]>,
): { files: Array<{ path: string; content: string }> } | { error: string } {
  const byPath = new Map<string, string>();
  for (const e of edits) {
    const path = e.path?.trim();
    if (!path || typeof e.find !== "string" || typeof e.replace !== "string") {
      return { error: "each edit needs { path, find, replace }" };
    }
    if (isProtectedPath(path)) return { error: `protected path: ${path}` };
    let content = byPath.get(path);
    if (content === undefined) {
      const current = readWithinRoot(root, path);
      if (current === null) {
        return { error: `cannot read ${path} for editing (use files:[] to create new files)` };
      }
      content = current;
    }
    if (!content.includes(e.find)) {
      return { error: `find text not found in ${path}: ${JSON.stringify(e.find.slice(0, 80))}` };
    }
    content = e.replaceAll ? content.split(e.find).join(e.replace) : content.replace(e.find, e.replace);
    byPath.set(path, content);
  }
  return { files: [...byPath.entries()].map(([path, content]) => ({ path, content })) };
}

/**
 * Real code self-edit through the checkpoint-backed patch pipeline (reversible
 * via code.rollback). Two modes: surgical `edits` (find/replace, preferred) or
 * full-file `files`. No external gateway needed.
 *
 * Loop the agent uses: filesystem.read (current content) → decide change →
 * code.self_edit (edits for small changes, files for new/large rewrites).
 */
export async function executeCodeSelfEdit(
  payload: unknown,
  workspaceRoot: string,
): Promise<ToolResult> {
  const body = payload as CodeSelfEditPayload;
  const instruction = body.instruction?.trim() || "self-edit";

  let surgical: Array<{ path: string; content: string }> = [];
  if (body.edits?.length) {
    const out = applyEdits(workspaceRoot, body.edits);
    if ("error" in out) return { status: "denied", reason: out.error };
    surgical = out.files;
  }

  const fullFiles = (body.files ?? [])
    .filter((f) => f.path?.trim() && typeof f.content === "string")
    .map((f) => ({ path: f.path!.trim(), content: f.content as string }));
  for (const f of fullFiles) {
    if (isProtectedPath(f.path)) {
      return { status: "denied", reason: `Refusing to edit protected path: ${f.path}` };
    }
  }

  // Merge; full-file entries override surgical results for the same path.
  const merged = new Map<string, string>();
  for (const f of surgical) merged.set(f.path, f.content);
  for (const f of fullFiles) merged.set(f.path, f.content);
  const files = [...merged.entries()].map(([path, content]) => ({ path, content }));

  if (!files.length) {
    return {
      status: "denied",
      reason:
        "code.self_edit needs either edits:[{path, find, replace}] (preferred for small changes) " +
        "or files:[{path, content}] with COMPLETE new file contents (for new files / big rewrites).",
    };
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
