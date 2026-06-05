import type Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Orchestrator } from "@hermes-os/orchestrator";
import { findWorkspaceRoot } from "@hermes-os/shared";
import {
  checkMessagesDbAccess,
  CHAT_DB_FDA_INSTRUCTIONS,
  fetchMessagesSince,
  type IncomingChatMessage,
} from "./chat-db.js";
import { isApprovedSender, loadApprovedSenders } from "./approved-senders.js";
import { shouldIgnoreInbound } from "./message-filters.js";
import { sendIMessage } from "./send-imessage.js";
import { formatParsedForOrchestrator, parseIncomingMessage } from "./incoming-parser.js";

const execFileAsync = promisify(execFile);
const CHAT_DB_RETRY_MS = Number(process.env.IMESSAGE_CHAT_DB_RETRY_MS ?? 300_000);

export type IMessageBridgeOptions = {
  pollIntervalMs?: number;
  onReply?: (handle: string, text: string) => void;
};

export class IMessageBridge {
  private lastRowId = 0;
  private readonly approved = loadApprovedSenders();
  private db: Database.Database | null = null;
  private chatState: "ready" | "blocked" = "ready";
  private userNotified = false;
  private lastAccessRetryAt = 0;

  constructor(private readonly orchestrator: Orchestrator) {}

  async pollOnce(): Promise<number> {
    if (this.chatState === "blocked") {
      if (Date.now() - this.lastAccessRetryAt < CHAT_DB_RETRY_MS) {
        return 0;
      }
      this.lastAccessRetryAt = Date.now();
      const recovered = this.tryOpenDb();
      if (!recovered) return 0;
      console.log("iMessage chat.db access restored — resuming bridge.");
    }

    if (!this.db) {
      const opened = this.tryOpenDb();
      if (!opened) return 0;
    }

    try {
      const messages = fetchMessagesSince(this.db!, this.lastRowId, 30);
      let handled = 0;

      for (const msg of messages) {
        this.lastRowId = Math.max(this.lastRowId, msg.rowid);
        if (!isApprovedSender(msg.handle, this.approved)) continue;
        if (shouldIgnoreInbound(msg.text, msg.handle)) {
          console.log(`Ignored automated/service message from ${msg.handle}`);
          continue;
        }
        await this.handleIncoming(msg);
        handled += 1;
      }

      return handled;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`chat.db read failed: ${msg}`);
      this.closeDb();
      return 0;
    }
  }

  async runLoop(options: IMessageBridgeOptions = {}): Promise<void> {
    const interval = options.pollIntervalMs ?? Number(process.env.IMESSAGE_POLL_MS ?? 3000);
    console.log(`iMessage bridge polling every ${interval}ms (workspace: ${findWorkspaceRoot()})`);

    const initial = checkMessagesDbAccess();
    if (initial.status !== "ok") {
      await this.onChatDbBlocked(initial.status, initial.message);
    } else {
      this.db = initial.db;
    }

    if (this.approved.size === 0) {
      console.warn(
        "No APPROVED_IMESSAGE_SENDERS or IMESSAGE_DEFAULT_RECIPIENT set — ignoring all inbound iMessage until configured.",
      );
    }

    for (;;) {
      try {
        const n = await this.pollOnce();
        if (n > 0) console.log(`Handled ${n} message(s)`);
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
      await sleep(interval);
    }
  }

  private tryOpenDb(): boolean {
    const access = checkMessagesDbAccess();
    if (access.status === "ok") {
      this.db = access.db;
      this.chatState = "ready";
      this.userNotified = false;
      return true;
    }
    void this.onChatDbBlocked(access.status, access.message);
    return false;
  }

  private async onChatDbBlocked(
    reason: "permission_denied" | "missing" | "error",
    detail?: string,
  ): Promise<void> {
    this.chatState = "blocked";
    this.closeDb();
    this.lastAccessRetryAt = Date.now();

    if (this.userNotified) return;
    this.userNotified = true;

    console.warn("\n" + CHAT_DB_FDA_INSTRUCTIONS + "\n");
    if (detail && reason !== "permission_denied") {
      console.warn(`Detail: ${detail}\n`);
    }

    await showMacNotification(
      "Hermes needs Full Disk Access",
      "Enable Terminal/Cursor in Privacy → Full Disk Access, then restart pnpm imessage",
    );

    const recipient = process.env.IMESSAGE_DEFAULT_RECIPIENT?.trim();
    if (recipient) {
      const ping = [
        "[Hermes] Paused — I cannot read iMessage (chat.db blocked).",
        "",
        "Grant Full Disk Access to Terminal/Cursor:",
        "System Settings → Privacy & Security → Full Disk Access",
        "",
        "Quit and reopen Terminal/Cursor, then restart: pnpm imessage",
        "",
        "Until then use the chat UI (pnpm start)",
        "Reply here when done and I will retry on the next cycle.",
      ].join("\n");
      const sent = await sendIMessage(recipient, ping);
      if (sent === "sent") {
        console.log(`Notified ${recipient} via iMessage (one-time). Bridge paused — no more spam.`);
      }
    } else {
      console.warn(
        "Set IMESSAGE_DEFAULT_RECIPIENT in .env for a one-time iMessage alert when chat.db is blocked.",
      );
    }
  }

  private closeDb(): void {
    try {
      this.db?.close();
    } catch {
      /* ok */
    }
    this.db = null;
  }

  private async handleIncoming(msg: IncomingChatMessage): Promise<void> {
    const parsed = parseIncomingMessage(msg.text);
    const text = formatParsedForOrchestrator(parsed);
    const reply = await this.orchestrator.handleMessage({
      channel: "imessage",
      senderId: msg.handle,
      text,
      receivedAt: new Date(msg.dateMs).toISOString(),
    });

    const sendResult = await sendIMessage(msg.handle, reply);
    if (sendResult !== "sent") {
      console.error(`Failed to send iMessage reply to ${msg.handle}: ${sendResult}`);
    }
  }
}

async function showMacNotification(title: string, body: string): Promise<void> {
  if (process.platform !== "darwin") return;
  const safe = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    await execFileAsync(
      "osascript",
      ["-e", `display notification "${safe(body)}" with title "${safe(title)}"`],
      { timeout: 10_000 },
    );
  } catch {
    /* non-fatal */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
