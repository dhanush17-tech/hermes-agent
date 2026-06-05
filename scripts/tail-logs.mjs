import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.HERMES_OS_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = resolve(root, "data/activity.jsonl");
const tailLines = Number(process.argv[2] ?? 50);

if (!existsSync(logPath)) {
  console.error(`No activity log yet: ${logPath}`);
  console.error("Start Hermes with: pnpm chat");
  process.exit(1);
}

console.log(`Live activity log — ${logPath}`);
console.log("(Ctrl+C to quit)\n");

const tail = spawn("tail", ["-n", String(tailLines), "-f", logPath], {
  stdio: ["ignore", "pipe", "inherit"],
});

const rl = createInterface({ input: tail.stdout });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    console.log(formatRow(JSON.parse(trimmed)));
  } catch {
    console.log(trimmed);
  }
});

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatRow(row) {
  const time = (row.createdAt ?? "").slice(11, 19) || "??:??:??";
  const payload = parseJson(row.payload);
  const result = parseJson(row.result);
  const type = row.eventType ?? "?";

  switch (type) {
    case "incoming_message":
      return `${time}  USER  ${String(payload?.text ?? "").slice(0, 100)}`;
    case "outgoing_message":
      return `${time}  REPLY  ${String(payload?.text ?? "").slice(0, 100)}`;
    case "agent_invoked": {
      const agent = payload?.agent ?? "?";
      const preview = payload?.messagePreview ? ` "${String(payload.messagePreview).slice(0, 60)}"` : "";
      return `${time}  AGENT ▶ ${agent}${preview}`;
    }
    case "agent_step": {
      const agent = payload?.agent ?? "?";
      const detail = payload?.think ?? payload?.detail ?? payload?.tool ?? "";
      const tool = payload?.tool ? ` [${payload.tool}]` : "";
      return `${time}  STEP   ${agent}${tool}  ${String(detail).slice(0, 100)}`;
    }
    case "agent_finished": {
      const agent = payload?.agent ?? "?";
      const ok = result?.ok !== false && !payload?.error;
      return `${time}  AGENT ${ok ? "✓" : "✗"} ${agent}`;
    }
    case "agent_blocked":
      return `${time}  PAUSE  ${payload?.agent ?? "?"}  ${String(payload?.question ?? "").slice(0, 80)}`;
    case "tool_call_requested":
      return `${time}  TOOL ? ${row.toolName ?? "?"}  [${row.riskLevel ?? "?"}]`;
    case "tool_call_executed":
      return `${time}  TOOL ✓ ${row.toolName ?? "?"}`;
    case "tool_call_denied":
      return `${time}  TOOL ✗ ${row.toolName ?? "?"}  ${String(result?.reason ?? payload?.reason ?? "").slice(0, 80)}`;
    case "intent_classified":
      return `${time}  ROUTE  ${payload?.intent ?? "?"} (${payload?.confidence ?? "?"})`;
    case "presence_scan":
      return `${time}  SCAN   ${payload?.service ?? "?"}  ${String(payload?.summary ?? "").slice(0, 80)}`;
    default:
      return `${time}  ${type.toUpperCase()}  ${JSON.stringify(payload ?? {}).slice(0, 100)}`;
  }
}
