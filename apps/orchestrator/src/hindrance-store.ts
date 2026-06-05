import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateId } from "@hermes-os/shared";

export type HindranceCategory =
  | "chat_db"
  | "vision"
  | "browser"
  | "permission"
  | "cloudflare"
  | "unknown";

export type ActiveHindrance = {
  id: string;
  category: HindranceCategory;
  issue: string;
  question: string;
  resolutionHint?: string;
  userNotified: boolean;
  createdAt: string;
};

export class HindranceStore {
  private readonly path: string;

  constructor(workspaceRoot: string) {
    this.path = join(workspaceRoot, "data", "pending-hindrance.json");
  }

  async getActive(): Promise<ActiveHindrance | null> {
    try {
      const raw = await readFile(this.path, "utf8");
      return JSON.parse(raw) as ActiveHindrance;
    } catch {
      return null;
    }
  }

  /** Returns null if same category already waiting (no duplicate alerts). */
  async report(input: {
    category: HindranceCategory;
    issue: string;
    question: string;
    resolutionHint?: string;
  }): Promise<ActiveHindrance | null> {
    const existing = await this.getActive();
    if (existing?.category === input.category) {
      return null;
    }

    const hindrance: ActiveHindrance = {
      id: generateId("hindrance"),
      category: input.category,
      issue: input.issue,
      question: input.question,
      resolutionHint: input.resolutionHint,
      userNotified: false,
      createdAt: new Date().toISOString(),
    };
    await mkdir(join(this.path, ".."), { recursive: true });
    await writeFile(this.path, JSON.stringify(hindrance, null, 2), "utf8");
    return hindrance;
  }

  async markNotified(): Promise<void> {
    const h = await this.getActive();
    if (!h) return;
    h.userNotified = true;
    await writeFile(this.path, JSON.stringify(h, null, 2), "utf8");
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path);
    } catch {
      /* ok */
    }
  }

  isResumeMessage(text: string): boolean {
    return /\b(done|fixed|granted|continue|resume|retry|ok|ready|go ahead|try again|request again)\b/i.test(
      text.trim(),
    );
  }
}
