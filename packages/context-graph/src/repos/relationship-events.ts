import { desc, eq } from "drizzle-orm";
import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { relationshipEvents } from "../schema.js";
import type { RelationshipEvent, RelationshipEventInput } from "../graph/types.js";

export class RelationshipEventsRepository {
  constructor(private readonly db: ContextGraphDb) {}

  async insert(input: RelationshipEventInput): Promise<RelationshipEvent> {
    const now = new Date().toISOString();
    const record: RelationshipEvent = {
      id: generateId("re"),
      personId: input.personId,
      sourceItemId: input.sourceItemId,
      eventType: input.eventType,
      summary: input.summary,
      sentiment: input.sentiment,
      importance: input.importance ?? 3,
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
    };
    await this.db.insert(relationshipEvents).values({
      id: record.id,
      personId: record.personId,
      sourceItemId: record.sourceItemId ?? null,
      eventType: record.eventType,
      summary: record.summary,
      sentiment: record.sentiment ?? null,
      importance: record.importance,
      occurredAt: record.occurredAt,
      createdAt: record.createdAt,
    });
    return record;
  }

  async listByPerson(personId: string, limit = 20): Promise<RelationshipEvent[]> {
    const rows = await this.db
      .select()
      .from(relationshipEvents)
      .where(eq(relationshipEvents.personId, personId))
      .orderBy(desc(relationshipEvents.occurredAt))
      .limit(limit);
    return rows.map((r) => this.rowToEvent(r));
  }

  private rowToEvent(row: typeof relationshipEvents.$inferSelect): RelationshipEvent {
    return {
      id: row.id,
      personId: row.personId,
      sourceItemId: row.sourceItemId ?? undefined,
      eventType: row.eventType,
      summary: row.summary,
      sentiment: row.sentiment ?? undefined,
      importance: row.importance ?? 3,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }
}
