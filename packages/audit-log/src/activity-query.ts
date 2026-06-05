import type { AuditRepository } from "@hermes-os/context-graph";
import { formatActivityReport, type ActivityRow } from "./format-activity.js";

export function rowsFromAudit(
  rows: Awaited<ReturnType<AuditRepository["listRecent"]>>,
): ActivityRow[] {
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    actor: r.actor,
    toolName: r.toolName,
    payload: r.payload,
    result: r.result,
    riskLevel: r.riskLevel,
    approvalId: r.approvalId,
    createdAt: r.createdAt,
  }));
}

export async function getActivityReport(
  repo: AuditRepository,
  limit = 40,
): Promise<string> {
  const rows = rowsFromAudit(await repo.listRecent(limit));
  return formatActivityReport(rows.reverse());
}

export async function getAgentSummary(
  repo: AuditRepository,
  limit = 200,
): Promise<{ agents: string[]; tools: string[]; eventCounts: Record<string, number> }> {
  const rows = await repo.listRecent(limit);
  const agents = new Set<string>();
  const tools = new Set<string>();
  const eventCounts: Record<string, number> = {};

  for (const row of rows) {
    eventCounts[row.eventType] = (eventCounts[row.eventType] ?? 0) + 1;
    if (row.toolName) tools.add(row.toolName);
    if (row.payload) {
      try {
        const p = JSON.parse(row.payload) as { agent?: string };
        if (p.agent) agents.add(p.agent);
      } catch {
        /* skip */
      }
    }
  }

  return {
    agents: [...agents].sort(),
    tools: [...tools].sort(),
    eventCounts,
  };
}
