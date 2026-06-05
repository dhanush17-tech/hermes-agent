import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "@hermes-os/shared";

const execFileAsync = promisify(execFile);

export type IMessagePayload = {
  body?: string;
  recipient?: string;
  handle?: string;
};

export async function executeIMessageSend(payload: unknown): Promise<ToolResult> {
  const body = payload as IMessagePayload;
  const text = typeof body.body === "string" ? body.body.trim() : "";
  const recipientRaw = body.recipient ?? body.handle ?? process.env.IMESSAGE_DEFAULT_RECIPIENT;
  const recipient = typeof recipientRaw === "string" ? recipientRaw.trim() : "";

  if (!text) return { status: "denied", reason: "body required" };
  if (!recipient) {
    return {
      status: "denied",
      reason: "recipient required (set IMESSAGE_DEFAULT_RECIPIENT or pass recipient in payload)",
    };
  }

  if (process.platform !== "darwin") {
    return { status: "denied", reason: "iMessage send is macOS-only" };
  }

  const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedRecipient = recipient.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${escapedRecipient}" of targetService
      send "${escapedText}" to targetBuddy
    end tell
  `;

  try {
    await execFileAsync("osascript", ["-e", script], { timeout: 30_000 });
    return { status: "success", data: { sent: true, recipient, chars: text.length } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "denied", reason: `iMessage send failed: ${msg}` };
  }
}
