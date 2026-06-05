import { desc, eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { people } from "../schema.js";
import type { Person, PersonInput } from "../graph/types.js";

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function parseHandles(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as Record<string, string>;
    return typeof v === "object" && v ? v : {};
  } catch {
    return {};
  }
}

export class PeopleRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async listImportant(limit = 15): Promise<Person[]> {
    const rows = await this.db.select().from(people).orderBy(desc(people.importanceScore)).limit(limit);
    return rows.map((r) => this.rowToPerson(r));
  }

  async getById(id: string): Promise<Person | null> {
    const rows = await this.db.select().from(people).where(eq(people.id, id)).limit(1);
    return rows[0] ? this.rowToPerson(rows[0]) : null;
  }

  async findByQuery(query: string, limit = 20): Promise<Person[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.listImportant(limit);
    const rows = await this.db.select().from(people);
    return rows
      .map((r) => this.rowToPerson(r))
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.emails.some((e) => e.toLowerCase().includes(q)) ||
          (p.organization?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, limit);
  }

  async upsertPerson(input: PersonInput): Promise<Person> {
    const email = input.emails?.[0];
    if (email) {
      const id = await this.upsertByEmail({
        name: input.name,
        email,
        role: input.role,
        organization: input.organization,
        relationshipType: input.relationshipType,
        importanceScore: input.importanceScore,
      });
      const person = await this.getById(id);
      if (person) return person;
    }
    const now = new Date().toISOString();
    const id = generateId("person");
    await this.db.insert(people).values({
      id,
      name: input.name,
      emails: JSON.stringify(input.emails ?? []),
      handles: JSON.stringify(input.handles ?? {}),
      role: input.role ?? null,
      organization: input.organization ?? null,
      relationshipType: input.relationshipType ?? null,
      importanceScore: input.importanceScore ?? 3,
      notes: input.notes ?? null,
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getById(id))!;
  }

  async upsertByEmail(input: {
    name: string;
    email: string;
    role?: string;
    organization?: string;
    relationshipType?: string;
    importanceScore?: number;
  }): Promise<string> {
    const rows = await this.db.select().from(people);
    const match = rows.find((p) => parseJsonArray(p.emails).includes(input.email.toLowerCase()));
    const now = new Date().toISOString();
    if (match) {
      await this.db
        .update(people)
        .set({
          name: input.name,
          lastInteractionAt: now,
          updatedAt: now,
          importanceScore: input.importanceScore ?? match.importanceScore ?? 3,
        })
        .where(eq(people.id, match.id));
      return match.id;
    }
    const id = generateId("person");
    await this.db.insert(people).values({
      id,
      name: input.name,
      emails: JSON.stringify([input.email.toLowerCase()]),
      role: input.role,
      organization: input.organization,
      relationshipType: input.relationshipType,
      importanceScore: input.importanceScore ?? 3,
      lastInteractionAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  private rowToPerson(row: typeof people.$inferSelect): Person {
    return {
      id: row.id,
      name: row.name,
      emails: parseJsonArray(row.emails),
      phones: [],
      handles: parseHandles(row.handles),
      organization: row.organization ?? undefined,
      role: row.role ?? undefined,
      relationshipType: row.relationshipType ?? undefined,
      importanceScore: row.importanceScore ?? 3,
      lastInteractionAt: row.lastInteractionAt ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
