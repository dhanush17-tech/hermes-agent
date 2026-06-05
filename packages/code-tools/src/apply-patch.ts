import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { generateId } from "@hermes-os/shared";

export type ApplyPatchResult = {
  applied: string[];
  checkpointId: string;
};

async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)));
    } else {
      out.push(relative(base, full));
    }
  }
  return out;
}

export async function applyProposedPatch(
  workspaceRoot: string,
  patchId: string,
): Promise<ApplyPatchResult> {
  const patchDir = join(workspaceRoot, "data", "proposed-patches", patchId);
  const checkpointId = generateId("ckpt");
  const checkpointDir = join(workspaceRoot, "data", "checkpoints", checkpointId);
  await mkdir(checkpointDir, { recursive: true });

  const files = (await listFilesRecursive(patchDir)).filter(
    (f) => f !== "meta.json" && f !== "preview.md" && f !== "PATCH.md",
  );

  const applied: string[] = [];
  for (const rel of files) {
    const src = join(patchDir, rel);
    const dest = join(workspaceRoot, rel);
    try {
      await mkdir(join(dest, ".."), { recursive: true });
      try {
        await copyFile(dest, join(checkpointDir, rel));
      } catch {
        /* new file */
      }
      const content = await readFile(src, "utf8");
      await writeFile(dest, content, "utf8");
      applied.push(rel);
    } catch (err) {
      throw new Error(`Failed to apply ${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await writeFile(
    join(checkpointDir, "meta.json"),
    JSON.stringify({ patchId, applied, createdAt: new Date().toISOString() }),
  );

  return { applied, checkpointId };
}
