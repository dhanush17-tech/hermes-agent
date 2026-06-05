import type { AuditLogger } from "@hermes-os/audit-log";
import type { SourceItemsRepository } from "@hermes-os/context-graph";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { OpenLoopsRepository } from "@hermes-os/context-graph";
import type { TasksRepository } from "@hermes-os/context-graph";
import type { ProactivityPolicy } from "@hermes-os/policies";
import { RiskEngine } from "@hermes-os/risk-engine";
import type { ConnectorHub } from "./connector-hub.js";

export type ProactiveNotification = {
  score: number;
  title: string;
  body: string;
  sourceType: string;
  dedupeKey: string;
};

export class ProactiveScanner {
  private readonly riskEngine: RiskEngine;

  constructor(
    private readonly hub: ConnectorHub,
    private readonly sourceItems: SourceItemsRepository,
    private readonly openLoops: OpenLoopsRepository,
    private readonly tasks: TasksRepository,
    private readonly stateRepo: AssistantStateRepository,
    private readonly policy: ProactivityPolicy,
    private readonly audit: AuditLogger,
    workspaceRoot?: string,
  ) {
    this.riskEngine = new RiskEngine({ workspaceRoot });
  }

  async runScan(): Promise<ProactiveNotification[]> {
    const startedAt = new Date().toISOString();
    await this.audit.log({
      eventType: "proactive_scan_started",
      actor: "system",
      payload: { at: startedAt },
    });

    await this.hub.scanAll();
    await this.stateRepo.setLastScanAt(new Date().toISOString());

    const items = await this.sourceItems.listRecent(40);
    const loops = await this.openLoops.listOpen(20);
    const taskRows = await this.tasks.listOpen(20);

    const risks = await this.riskEngine.detect({
      sourceItems: items,
      openLoops: loops.map((l) => ({
        description: l.description,
        dueDate: l.dueDate ?? null,
        importanceScore: l.importanceScore ?? null,
        status: l.status ?? null,
      })),
      tasks: taskRows.map((t) => ({
        title: t.title,
        dueDate: t.dueDate,
        status: t.status,
      })),
    });

    const notifications: ProactiveNotification[] = [];

    for (const risk of risks) {
      if (risk.score < this.policy.daily_brief_score_min) continue;
      const alert = this.riskEngine.formatProactiveAlert(risk);
      const n = this.riskEngine.toNotification(risk);
      notifications.push({
        score: alert.score,
        title: alert.title,
        body: alert.body,
        sourceType: risk.category,
        dedupeKey: n.dedupeKey,
      });
    }

    notifications.sort((a, b) => b.score - a.score);
    return notifications.slice(0, 5);
  }
}
