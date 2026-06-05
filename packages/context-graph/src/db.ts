import Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { findWorkspaceRoot } from "@hermes-os/shared";
import * as schema from "./schema.js";

export type ContextGraphDb = BetterSQLite3Database<typeof schema>;

export function resolveDatabasePath(path?: string): string {
  if (path) return resolve(path);
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  return resolve(root, process.env.DATABASE_PATH ?? "data/local.sqlite");
}

export function createDb(databasePath?: string): {
  db: ContextGraphDb;
  sqlite: Database.Database;
  filePath: string;
} {
  const filePath = resolveDatabasePath(databasePath);
  mkdirSync(dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, filePath };
}

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emails TEXT,
      handles TEXT,
      role TEXT,
      organization TEXT,
      relationship_type TEXT,
      importance_score REAL,
      last_interaction_at TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS people_importance_idx ON people(importance_score);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      priority INTEGER,
      status TEXT,
      goals TEXT,
      related_people TEXT,
      related_documents TEXT,
      deadlines TEXT,
      risks TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      starts_at TEXT,
      ends_at TEXT,
      location TEXT,
      related_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT,
      due_date TEXT,
      related_project_id TEXT,
      importance_score REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
    CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);

    CREATE TABLE IF NOT EXISTS open_loops (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      description TEXT NOT NULL,
      owner TEXT,
      related_person_id TEXT,
      related_project_id TEXT,
      due_date TEXT,
      importance_score REAL,
      confidence REAL,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS open_loops_status_idx ON open_loops(status);
    CREATE INDEX IF NOT EXISTS open_loops_due_date_idx ON open_loops(due_date);

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT,
      path TEXT,
      related_project_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      claim TEXT NOT NULL,
      evidence_count INTEGER,
      examples TEXT,
      confidence REAL,
      last_seen_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id TEXT PRIMARY KEY,
      category TEXT,
      preference TEXT NOT NULL,
      evidence TEXT,
      confidence REAL,
      scope TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risks (
      id TEXT PRIMARY KEY,
      category TEXT,
      description TEXT NOT NULL,
      impact REAL,
      urgency REAL,
      confidence REAL,
      score REAL,
      related_project_id TEXT,
      related_person_id TEXT,
      status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS risks_status_idx ON risks(status);

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT,
      source_id TEXT,
      confidence REAL,
      scope TEXT,
      expiry TEXT,
      evidence TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      exact_payload TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(status);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      tool_name TEXT,
      payload TEXT,
      result TEXT,
      risk_level TEXT,
      approval_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS source_items (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,
      external_id TEXT,
      title TEXT,
      content TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assistant_state (
      id TEXT PRIMARY KEY DEFAULT 'default',
      state TEXT NOT NULL,
      last_scan_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS capability_leases (
      id TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      approved_channel TEXT NOT NULL,
      allowed_destination TEXT,
      allowed_account TEXT,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS capability_leases_approval_idx ON capability_leases(approval_id);

    CREATE TABLE IF NOT EXISTS notification_history (
      id TEXT PRIMARY KEY,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      priority TEXT,
      score REAL,
      dedupe_key TEXT,
      status TEXT DEFAULT 'sent',
      sent_channel TEXT,
      sent_at TEXT,
      user_response TEXT,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS notification_history_dedupe_idx ON notification_history(dedupe_key);

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      claim TEXT,
      confidence REAL DEFAULT 0.7,
      created_at TEXT NOT NULL,
      FOREIGN KEY(source_item_id) REFERENCES source_items(id)
    );
    CREATE INDEX IF NOT EXISTS evidence_items_source_idx ON evidence_items(source_item_id);

    CREATE TABLE IF NOT EXISTS commitments (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      owner TEXT NOT NULL,
      counterparty_person_id TEXT,
      related_project_id TEXT,
      due_at TEXT,
      status TEXT DEFAULT 'open',
      source_item_id TEXT,
      evidence_item_id TEXT,
      confidence REAL DEFAULT 0.7,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS commitments_status_idx ON commitments(status);

    CREATE TABLE IF NOT EXISTS relationship_events (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL,
      source_item_id TEXT,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      sentiment TEXT,
      importance INTEGER DEFAULT 3,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(person_id) REFERENCES people(id)
    );
    CREATE INDEX IF NOT EXISTS relationship_events_person_idx ON relationship_events(person_id);
  `);

  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO assistant_state (id, state, updated_at) VALUES ('default', 'running', ?)`,
    )
    .run(now);
}
