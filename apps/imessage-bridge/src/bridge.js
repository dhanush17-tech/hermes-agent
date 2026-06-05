import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { findWorkspaceRoot } from "@hermes-os/shared";
import { checkMessagesDbAccess, CHAT_DB_FDA_INSTRUCTIONS, fetchMessagesSince, } from "./chat-db.js";
import { isApprovedSender, loadApprovedSenders } from "./approved-senders.js";
import { shouldIgnoreInbound } from "./message-filters.js";
import { sendIMessage } from "./send-imessage.js";
import { formatParsedForOrchestrator, parseIncomingMessage } from "./incoming-parser.js";
const execFileAsync = promisify(execFile);
const CHAT_DB_RETRY_MS = Number(process.env.IMESSAGE_CHAT_DB_RETRY_MS ?? 300_000);
export class IMessageBridge {
    orchestrator;
    lastRowId = 0;
    approved = loadApprovedSenders();
    db = null;
    chatState = "ready";
    userNotified = false;
    lastAccessRetryAt = 0;
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    async pollOnce() {
        if (this.chatState === "blocked") {
            if (Date.now() - this.lastAccessRetryAt < CHAT_DB_RETRY_MS) {
                return 0;
            }
            this.lastAccessRetryAt = Date.now();
            const recovered = this.tryOpenDb();
            if (!recovered)
                return 0;
            console.log("iMessage chat.db access restored — resuming bridge.");
        }
        if (!this.db) {
            const opened = this.tryOpenDb();
            if (!opened)
                return 0;
        }
        try {
            const messages = fetchMessagesSince(this.db, this.lastRowId, 30);
            let handled = 0;
            for (const msg of messages) {
                this.lastRowId = Math.max(this.lastRowId, msg.rowid);
                if (!isApprovedSender(msg.handle, this.approved))
                    continue;
                if (shouldIgnoreInbound(msg.text, msg.handle)) {
                    console.log(`Ignored automated/service message from ${msg.handle}`);
                    continue;
                }
                await this.handleIncoming(msg);
                handled += 1;
            }
            return handled;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`chat.db read failed: ${msg}`);
            this.closeDb();
            return 0;
        }
    }
    async runLoop(options = {}) {
        const interval = options.pollIntervalMs ?? Number(process.env.IMESSAGE_POLL_MS ?? 3000);
        console.log(`iMessage bridge polling every ${interval}ms (workspace: ${findWorkspaceRoot()})`);
        const initial = checkMessagesDbAccess();
        if (initial.status !== "ok") {
            await this.onChatDbBlocked(initial.status, initial.message);
        }
        else {
            this.db = initial.db;
        }
        if (this.approved.size === 0) {
            console.warn("No APPROVED_IMESSAGE_SENDERS or IMESSAGE_DEFAULT_RECIPIENT set — ignoring all inbound iMessage until configured.");
        }
        for (;;) {
            try {
                const n = await this.pollOnce();
                if (n > 0)
                    console.log(`Handled ${n} message(s)`);
            }
            catch (err) {
                console.error(err instanceof Error ? err.message : err);
            }
            await sleep(interval);
        }
    }
    tryOpenDb() {
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
    async onChatDbBlocked(reason, detail) {
        this.chatState = "blocked";
        this.closeDb();
        this.lastAccessRetryAt = Date.now();
        if (this.userNotified)
            return;
        this.userNotified = true;
        console.warn("\n" + CHAT_DB_FDA_INSTRUCTIONS + "\n");
        if (detail && reason !== "permission_denied") {
            console.warn(`Detail: ${detail}\n`);
        }
        await showMacNotification("Hermes needs Full Disk Access", "Enable Terminal/Cursor in Privacy → Full Disk Access, then restart pnpm imessage");
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
                "Until then use: pnpm cli",
                "Reply here when done and I will retry on the next cycle.",
            ].join("\n");
            const sent = await sendIMessage(recipient, ping);
            if (sent === "sent") {
                console.log(`Notified ${recipient} via iMessage (one-time). Bridge paused — no more spam.`);
            }
        }
        else {
            console.warn("Set IMESSAGE_DEFAULT_RECIPIENT in .env for a one-time iMessage alert when chat.db is blocked.");
        }
    }
    closeDb() {
        try {
            this.db?.close();
        }
        catch {
            /* ok */
        }
        this.db = null;
    }
    async handleIncoming(msg) {
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
async function showMacNotification(title, body) {
    if (process.platform !== "darwin")
        return;
    const safe = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
        await execFileAsync("osascript", ["-e", `display notification "${safe(body)}" with title "${safe(title)}"`], { timeout: 10_000 });
    }
    catch {
        /* non-fatal */
    }
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
//# sourceMappingURL=bridge.js.map