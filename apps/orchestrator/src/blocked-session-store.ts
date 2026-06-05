import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type PendingBlockedSession = {
  id: string;
  goal: string;
  question: string;
  trace: string[];
  createdAt: string;
};

export class BlockedSessionStore {
  private readonly path: string;

  constructor(workspaceRoot: string) {
    this.path = join(workspaceRoot, "data", "pending-blocked.json");
  }

  async get(): Promise<PendingBlockedSession | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as PendingBlockedSession;
    } catch {
      return null;
    }
  }

  async save(session: PendingBlockedSession): Promise<void> {
    await mkdir(join(this.path, ".."), { recursive: true });
    await writeFile(this.path, JSON.stringify(session, null, 2), "utf8");
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path);
    } catch {
      /* ok */
    }
  }
}
