import Database from "better-sqlite3";
import { accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type IncomingChatMessage = {
  rowid: number;
  handle: string;
  text: string;
  dateMs: number;
};

export const CHAT_DB_PATH = join(homedir(), "Library", "Messages", "chat.db");

export const CHAT_DB_FDA_INSTRUCTIONS = [
  "Hermes cannot read iMessage (chat.db) — Full Disk Access required.",
  "",
  "1. Open System Settings → Privacy & Security → Full Disk Access",
  "2. Enable Terminal and/or Cursor (whichever runs `pnpm imessage`)",
  "3. Quit and reopen that app, then restart: pnpm imessage",
  "",
  "Bridge is paused until access works (silent retry every few minutes).",
  "You can still use the chat UI (pnpm start)",
].join("\n");

export type ChatDbAccess =
  | { status: "ok"; db: Database.Database }
  | { status: "permission_denied"; message: string }
  | { status: "missing"; message: string }
  | { status: "error"; message: string };

/** @deprecated use checkMessagesDbAccess */
export function openMessagesDb(): Database.Database | null {
  const result = checkMessagesDbAccess();
  return result.status === "ok" ? result.db : null;
}

export function checkMessagesDbAccess(): ChatDbAccess {
  try {
    accessSync(CHAT_DB_PATH, constants.F_OK);
  } catch {
    return {
      status: "missing",
      message: `Messages database not found at ${CHAT_DB_PATH}`,
    };
  }

  try {
    const db = new Database(CHAT_DB_PATH, { readonly: true, fileMustExist: true });
    db.prepare("SELECT 1").get();
    return { status: "ok", db };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isPermissionError(msg)) {
      return { status: "permission_denied", message: msg };
    }
    return { status: "error", message: msg };
  }
}

function isPermissionError(message: string): boolean {
  return (
    /permission|authorized|authorization|eacces|eperm|not authorized|full disk/i.test(
      message,
    ) || /unable to open database file/i.test(message)
  );
}

export function fetchMessagesSince(
  db: Database.Database,
  sinceRowId: number,
  limit = 20,
): IncomingChatMessage[] {
  const rows = db
    .prepare(
      `
    SELECT
      m.ROWID as rowid,
      h.id as handle,
      m.text as text,
      m.date as date
    FROM message m
    JOIN handle h ON m.handle_id = h.ROWID
    WHERE m.is_from_me = 0
      AND m.text IS NOT NULL
      AND m.text != ''
      AND m.ROWID > ?
    ORDER BY m.ROWID ASC
    LIMIT ?
  `,
    )
    .all(sinceRowId, limit) as Array<{
      rowid: number;
      handle: string;
      text: string;
      date: number;
    }>;

  return rows
    .map((r) => {
      const text = normalizeMessageText(r.text);
      if (!text) return null;
      return {
        rowid: r.rowid,
        handle: String(r.handle ?? ""),
        text,
        dateMs: appleDateToMs(r.date),
      };
    })
    .filter((m): m is IncomingChatMessage => m !== null);
}

export function fetchLatestMessageRowId(db: Database.Database): number {
  const row = db.prepare("SELECT COALESCE(MAX(ROWID), 0) as rowid FROM message").get() as
    | { rowid?: number }
    | undefined;
  return Number(row?.rowid ?? 0);
}

function normalizeMessageText(raw: unknown): string | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  if (raw == null) return null;
  if (typeof raw === "number" || typeof raw === "boolean") {
    const t = String(raw).trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function appleDateToMs(raw: number): number {
  if (raw > 1e15) return Math.floor(raw / 1_000_000) + 978_307_200_000;
  if (raw > 1e12) return raw;
  return raw * 1000;
}
