import { desc, eq } from "drizzle-orm";
import type { ContextGraphDb } from "../db.js";
import { tasks } from "../schema.js";

export class TasksRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async listOpen(limit = 20) {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "open"))
      .orderBy(desc(tasks.importanceScore))
      .limit(limit);
    return rows;
  }

  async countOpen(): Promise<number> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.status, "open"));
    return rows.length;
  }
}
