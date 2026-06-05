import { eq } from "drizzle-orm";
import type { AssistantState } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { assistantState } from "../schema.js";

export class AssistantStateRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async getState(): Promise<AssistantState> {
    const rows = await this.db.select().from(assistantState).where(eq(assistantState.id, "default")).limit(1);
    return (rows[0]?.state as AssistantState) ?? "running";
  }

  async setState(state: AssistantState): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(assistantState)
      .set({ state, updatedAt: now })
      .where(eq(assistantState.id, "default"));
  }

  async getLastScanAt(): Promise<string | null> {
    const rows = await this.db.select().from(assistantState).where(eq(assistantState.id, "default")).limit(1);
    return rows[0]?.lastScanAt ?? null;
  }

  async setLastScanAt(iso: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(assistantState)
      .set({ lastScanAt: iso, updatedAt: now })
      .where(eq(assistantState.id, "default"));
  }
}
