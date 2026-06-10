import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { IntentEntities } from "@hermes-os/shared";

export type PendingLoginSession = {
  id: string;
  service: string;
  email?: string;
  browser?: "arc" | "playwright";
  url: string;
  originalText: string;
  entities?: IntentEntities;
  preferCompose?: boolean;
  createdAt: string;
};

export class LoginSessionStore {
  private readonly path: string;

  constructor(workspaceRoot: string) {
    this.path = join(workspaceRoot, "data", "pending-login.json");
  }

  async get(): Promise<PendingLoginSession | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as PendingLoginSession;
    } catch {
      return null;
    }
  }

  async save(session: PendingLoginSession): Promise<void> {
    const dir = join(this.path, "..");
    await mkdir(dir, { recursive: true });
    await writeFile(this.path, JSON.stringify(session, null, 2), "utf8");
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path);
    } catch {
      // already cleared
    }
  }
}
