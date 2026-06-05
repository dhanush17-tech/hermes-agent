import { copyFile, readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export async function rollbackCheckpoint(
  workspaceRoot: string,
  checkpointId: string,
): Promise<string[]> {
  const checkpointDir = join(workspaceRoot, "data", "checkpoints", checkpointId);
  const restored: string[] = [];

  async function walk(dir: string, base: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full, base);
        continue;
      }
      const rel = relative(base, full);
      if (rel === "meta.json") continue;
      const dest = join(workspaceRoot, rel);
      await copyFile(full, dest);
      restored.push(rel);
    }
  }

  await walk(checkpointDir, checkpointDir);
  return restored;
}

export async function readCheckpointMeta(
  workspaceRoot: string,
  checkpointId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(workspaceRoot, "data", "checkpoints", checkpointId, "meta.json"), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
