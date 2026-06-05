import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generateId } from "@hermes-os/shared";

export type ProposePatchInput = {
  instruction: string;
  files?: Array<{ path: string; content: string }>;
};

export type ProposedPatch = {
  patchId: string;
  patchDir: string;
  diffPreview: string;
  files: string[];
};

export async function proposePatch(
  workspaceRoot: string,
  input: ProposePatchInput,
): Promise<ProposedPatch> {
  const patchId = generateId("patch");
  const patchDir = join(workspaceRoot, "data", "proposed-patches", patchId);
  await mkdir(patchDir, { recursive: true });

  const files = input.files ?? [];
  const lines: string[] = [`# Patch ${patchId}`, "", input.instruction, ""];

  for (const f of files) {
    const safePath = f.path.replace(/\.\./g, "");
    const target = join(patchDir, safePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.content, "utf8");
    lines.push(`## ${safePath}`, "```diff", `+ ${f.content.slice(0, 500)}`, "```", "");
  }

  if (files.length === 0) {
    const stub = join(patchDir, "PATCH.md");
    await writeFile(stub, `${input.instruction}\n`, "utf8");
    lines.push("(Instruction-only patch — apply via code.apply_patch_after_approval with file payloads)");
  }

  const metaPath = join(patchDir, "meta.json");
  await writeFile(
    metaPath,
    JSON.stringify({ patchId, instruction: input.instruction, files: files.map((f) => f.path) }, null, 2),
  );

  const diffPreview = lines.join("\n").slice(0, 4000);
  await writeFile(join(patchDir, "preview.md"), diffPreview);

  return {
    patchId,
    patchDir,
    diffPreview,
    files: files.map((f) => f.path),
  };
}

export async function loadPatchMeta(
  workspaceRoot: string,
  patchId: string,
): Promise<{ patchDir: string; instruction: string } | null> {
  const patchDir = join(workspaceRoot, "data", "proposed-patches", patchId);
  try {
    const raw = await readFile(join(patchDir, "meta.json"), "utf8");
    const meta = JSON.parse(raw) as { instruction?: string };
    return { patchDir, instruction: meta.instruction ?? "" };
  } catch {
    return null;
  }
}
