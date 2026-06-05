import type { AuditLogger } from "@hermes-os/audit-log";
import type {
  OpenLoopsRepository,
  RisksRepository,
  SourceItemsRepository,
  TasksRepository,
} from "@hermes-os/context-graph";
import { RiskEngine, type DetectedRisk } from "@hermes-os/risk-engine";

export class RiskPredictionAgent {
  private readonly engine = new RiskEngine();

  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly openLoops: OpenLoopsRepository,
    private readonly tasks: TasksRepository,
    private readonly risksRepo: RisksRepository,
    private readonly audit: AuditLogger,
  ) {}

  async scanAndPersist(): Promise<DetectedRisk[]> {
    const items = await this.sourceItems.listRecent(40);
    const loops = await this.openLoops.listOpen(20);
    const taskRows = await this.tasks.listOpen(20);

    const risks = await this.engine.detect({
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

    const keep = new Set<string>();
    for (const r of risks) {
      keep.add(r.description);
      await this.risksRepo.upsertDetected({
        category: r.category,
        description: r.description,
        impact: r.impact,
        urgency: r.urgency,
        confidence: r.confidence,
        score: r.score,
      });
      await this.audit.log({
        eventType: "risk_detected",
        actor: "system",
        payload: {
          category: r.category,
          description: r.description,
          score: r.score,
        },
      });
    }
    await this.risksRepo.resolveStale(keep);
    return risks;
  }

  formatTopAlerts(risks: DetectedRisk[], limit = 3): string[] {
    return risks
      .filter((r) => r.score >= 40)
      .slice(0, limit)
      .map((r) => this.engine.formatProactiveAlert(r).body);
  }
}
