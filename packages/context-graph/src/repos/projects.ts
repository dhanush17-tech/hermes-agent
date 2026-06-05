import { desc, eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { projects } from "../schema.js";
import type { Project, ProjectInput } from "../graph/types.js";

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export class ProjectsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async listActive(limit = 10): Promise<Project[]> {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(desc(projects.priority))
      .limit(limit);
    return rows.map((r) => this.rowToProject(r));
  }

  async getById(id: string): Promise<Project | null> {
    const rows = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return rows[0] ? this.rowToProject(rows[0]) : null;
  }

  async findByQuery(query: string, limit = 10): Promise<Project[]> {
    const q = query.toLowerCase().trim();
    const rows = await this.db.select().from(projects);
    return rows
      .map((r) => this.rowToProject(r))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, limit);
  }

  async upsertProject(input: ProjectInput): Promise<Project> {
    const existing = await this.db
      .select()
      .from(projects)
      .where(eq(projects.name, input.name))
      .limit(1);
    const now = new Date().toISOString();
    if (existing[0]) {
      await this.db
        .update(projects)
        .set({
          description: input.description ?? existing[0].description,
          priority: input.priority ?? existing[0].priority ?? 3,
          status: input.status ?? existing[0].status ?? "active",
          goals: JSON.stringify(input.goals ?? parseJsonArray(existing[0].goals)),
          updatedAt: now,
        })
        .where(eq(projects.id, existing[0].id));
      return (await this.getById(existing[0].id))!;
    }
    const id = generateId("proj");
    await this.db.insert(projects).values({
      id,
      name: input.name,
      description: input.description ?? null,
      status: input.status ?? "active",
      priority: input.priority ?? 3,
      goals: JSON.stringify(input.goals ?? []),
      relatedPeople: JSON.stringify(input.relatedPeople ?? []),
      deadlines: JSON.stringify(input.deadlines ?? []),
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getById(id))!;
  }

  async ensureDefault(name: string): Promise<string> {
    const rows = await this.db.select().from(projects).where(eq(projects.name, name)).limit(1);
    if (rows[0]) return rows[0].id;
    const p = await this.upsertProject({ name });
    return p.id;
  }

  private rowToProject(row: typeof projects.$inferSelect): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status ?? "active",
      priority: row.priority ?? 3,
      goals: parseJsonArray(row.goals),
      relatedPeople: parseJsonArray(row.relatedPeople),
      relatedDocuments: parseJsonArray(row.relatedDocuments),
      deadlines: parseJsonArray(row.deadlines),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
