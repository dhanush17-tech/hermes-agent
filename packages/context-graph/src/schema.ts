import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    emails: text("emails"),
    handles: text("handles"),
    role: text("role"),
    organization: text("organization"),
    relationshipType: text("relationship_type"),
    importanceScore: real("importance_score"),
    lastInteractionAt: text("last_interaction_at"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("people_importance_idx").on(t.importanceScore)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    priority: integer("priority"),
    status: text("status"),
    goals: text("goals"),
    relatedPeople: text("related_people"),
    relatedDocuments: text("related_documents"),
    deadlines: text("deadlines"),
    risks: text("risks"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("projects_status_idx").on(t.status)],
);

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  location: text("location"),
  relatedProjectId: text("related_project_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status"),
    dueDate: text("due_date"),
    relatedProjectId: text("related_project_id"),
    importanceScore: real("importance_score"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("tasks_status_idx").on(t.status),
    index("tasks_due_date_idx").on(t.dueDate),
  ],
);

export const openLoops = sqliteTable(
  "open_loops",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    sourceId: text("source_id"),
    description: text("description").notNull(),
    owner: text("owner"),
    relatedPersonId: text("related_person_id"),
    relatedProjectId: text("related_project_id"),
    dueDate: text("due_date"),
    importanceScore: real("importance_score"),
    confidence: real("confidence"),
    status: text("status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("open_loops_status_idx").on(t.status),
    index("open_loops_due_date_idx").on(t.dueDate),
  ],
);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  title: text("title"),
  path: text("path"),
  relatedProjectId: text("related_project_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const habits = sqliteTable("habits", {
  id: text("id").primaryKey(),
  claim: text("claim").notNull(),
  evidenceCount: integer("evidence_count"),
  examples: text("examples"),
  confidence: real("confidence"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const preferences = sqliteTable("preferences", {
  id: text("id").primaryKey(),
  category: text("category"),
  preference: text("preference").notNull(),
  evidence: text("evidence"),
  confidence: real("confidence"),
  scope: text("scope"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const risks = sqliteTable(
  "risks",
  {
    id: text("id").primaryKey(),
    category: text("category"),
    description: text("description").notNull(),
    impact: real("impact"),
    urgency: real("urgency"),
    confidence: real("confidence"),
    score: real("score"),
    relatedProjectId: text("related_project_id"),
    relatedPersonId: text("related_person_id"),
    status: text("status"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("risks_status_idx").on(t.status)],
);

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  memoryType: text("memory_type").notNull(),
  content: text("content").notNull(),
  source: text("source"),
  sourceId: text("source_id"),
  confidence: real("confidence"),
  scope: text("scope"),
  expiry: text("expiry"),
  evidence: text("evidence"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    actionType: text("action_type").notNull(),
    summary: text("summary").notNull(),
    exactPayload: text("exact_payload").notNull(),
    payloadHash: text("payload_hash").notNull(),
    riskLevel: text("risk_level").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("approvals_status_idx").on(t.status)],
);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  toolName: text("tool_name"),
  payload: text("payload"),
  result: text("result"),
  riskLevel: text("risk_level"),
  approvalId: text("approval_id"),
  createdAt: text("created_at").notNull(),
});

export const sourceItems = sqliteTable("source_items", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull(),
  externalId: text("external_id"),
  title: text("title"),
  content: text("content"),
  metadata: text("metadata"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const assistantState = sqliteTable("assistant_state", {
  id: text("id").primaryKey().default("default"),
  state: text("state").notNull(),
  lastScanAt: text("last_scan_at"),
  updatedAt: text("updated_at").notNull(),
});

export const capabilityLeases = sqliteTable(
  "capability_leases",
  {
    id: text("id").primaryKey(),
    approvalId: text("approval_id").notNull(),
    toolName: text("tool_name").notNull(),
    payloadHash: text("payload_hash").notNull(),
    riskLevel: text("risk_level").notNull(),
    approvedBy: text("approved_by").notNull(),
    approvedChannel: text("approved_channel").notNull(),
    allowedDestination: text("allowed_destination"),
    allowedAccount: text("allowed_account"),
    maxUses: integer("max_uses").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("capability_leases_approval_idx").on(t.approvalId)],
);

export const notificationHistory = sqliteTable(
  "notification_history",
  {
    id: text("id").primaryKey(),
    notificationType: text("notification_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    priority: text("priority"),
    score: real("score"),
    dedupeKey: text("dedupe_key"),
    status: text("status").default("sent"),
    sentChannel: text("sent_channel"),
    sentAt: text("sent_at"),
    userResponse: text("user_response"),
    resolvedAt: text("resolved_at"),
  },
  (t) => [index("notification_history_dedupe_idx").on(t.dedupeKey)],
);

export const evidenceItems = sqliteTable(
  "evidence_items",
  {
    id: text("id").primaryKey(),
    sourceItemId: text("source_item_id").notNull(),
    excerpt: text("excerpt").notNull(),
    claim: text("claim"),
    confidence: real("confidence").default(0.7),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("evidence_items_source_idx").on(t.sourceItemId)],
);

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    description: text("description").notNull(),
    owner: text("owner").notNull(),
    counterpartyPersonId: text("counterparty_person_id"),
    relatedProjectId: text("related_project_id"),
    dueAt: text("due_at"),
    status: text("status").default("open"),
    sourceItemId: text("source_item_id"),
    evidenceItemId: text("evidence_item_id"),
    confidence: real("confidence").default(0.7),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("commitments_status_idx").on(t.status)],
);

export const relationshipEvents = sqliteTable(
  "relationship_events",
  {
    id: text("id").primaryKey(),
    personId: text("person_id").notNull(),
    sourceItemId: text("source_item_id"),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    sentiment: text("sentiment"),
    importance: integer("importance").default(3),
    occurredAt: text("occurred_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("relationship_events_person_idx").on(t.personId)],
);
