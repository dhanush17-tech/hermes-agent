import type { AuditEventType } from "@hermes-os/shared";

export type ActivityRow = {
  id: string;
  eventType: string;
  actor: string;
  toolName: string | null;
  payload: string | null;
  result: string | null;
  riskLevel: string | null;
  approvalId: string | null;
  createdAt: string;
};

function parseJsonField(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function formatActivityLine(row: ActivityRow): string {
  const time = row.createdAt.slice(11, 19);
  const payload = parseJsonField(row.payload);
  const result = parseJsonField(row.result);

  switch (row.eventType as AuditEventType) {
    case "agent_invoked": {
      const agent = payload?.agent ?? "?";
      const intent = payload?.intent ? ` intent=${payload.intent}` : "";
      const preview = payload?.messagePreview ? ` "${String(payload.messagePreview).slice(0, 60)}"` : "";
      return `${time}  AGENT ▶ ${agent}${intent}${preview}`;
    }
    case "agent_step": {
      const agent = payload?.agent ?? "?";
      const step = payload?.step ?? payload?.think ?? "";
      const tool = payload?.tool ? ` tool=${payload.tool}` : "";
      return `${time}  STEP   ${agent}  ${String(step).slice(0, 120)}${tool}`;
    }
    case "agent_finished": {
      const agent = payload?.agent ?? "?";
      const ok = result?.ok !== false && !payload?.error;
      const mark = ok ? "✓" : "✗";
      const preview = payload?.preview ? ` — ${String(payload.preview).slice(0, 80)}` : "";
      return `${time}  AGENT ${mark} ${agent}${preview}`;
    }
    case "agent_blocked": {
      const agent = payload?.agent ?? "?";
      return `${time}  PAUSE  ${agent}  ${String(payload?.question ?? "needs user").slice(0, 100)}`;
    }
    case "intent_classified": {
      return `${time}  ROUTE  ${payload?.intent ?? "?"} (${payload?.confidence ?? "?"})`;
    }
    case "tool_call_requested":
      return `${time}  TOOL ? ${row.toolName}  [${row.riskLevel ?? "—"}]`;
    case "tool_call_executed": {
      const status = (result as { status?: string })?.status ?? "ok";
      const reason =
        status === "denied" && typeof (result as { reason?: unknown }).reason === "string"
          ? ` — ${(result as { reason: string }).reason.slice(0, 100)}`
          : "";
      return `${time}  TOOL ✓ ${row.toolName}  ${status}${reason}`;
    }
    case "tool_call_denied":
      return `${time}  TOOL ✗ ${row.toolName}  ${(result as { reason?: string })?.reason ?? "denied"}`;
    case "presence_scan":
      return `${time}  SCAN  ${payload?.service ?? "?"}  ${String(payload?.summary ?? "").slice(0, 80)}`;
    case "proactive_notification_sent":
      return `${time}  ALERT ${String(payload?.title ?? payload?.type ?? "notify").slice(0, 80)}`;
    case "incoming_message":
      return `${time}  USER  ${String(payload?.text ?? "").slice(0, 100)}`;
    case "outgoing_message":
      return `${time}  REPLY  ${String(payload?.text ?? "").slice(0, 100)}`;
    case "risk_detected":
      return `${time}  RISK  ${String(payload?.description ?? "").slice(0, 100)}`;
    case "research_started":
      return `${time}  RESEARCH ▶ ${String(payload?.topic ?? "").slice(0, 80)}`;
    case "research_completed":
      return `${time}  RESEARCH ✓`;
    case "approval_requested":
    case "approval_approved":
    case "approval_denied":
      return `${time}  ${row.eventType.toUpperCase()}  ${row.toolName ?? row.approvalId ?? ""}`;
    default:
      return `${time}  ${row.eventType}  ${row.toolName ?? row.actor}`;
  }
}

export function formatActivityReport(rows: ActivityRow[]): string {
  if (!rows.length) return "No activity logged yet.";
  const lines = rows.map(formatActivityLine);
  const agents = new Set<string>();
  const tools = new Set<string>();
  for (const row of rows) {
    const p = parseJsonField(row.payload);
    if (p?.agent) agents.add(String(p.agent));
    if (row.toolName) tools.add(row.toolName);
  }
  return [
    `Activity (${rows.length} events)`,
    `Agents: ${[...agents].join(", ") || "—"}`,
    `Tools: ${[...tools].join(", ") || "—"}`,
    "",
    ...lines,
  ].join("\n");
}
