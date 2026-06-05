import type { AuditLogger } from "@hermes-os/audit-log";
import type { OpenLoopsRepository, RisksRepository, SourceItemsRepository, TasksRepository } from "@hermes-os/context-graph";
import { type DetectedRisk } from "@hermes-os/risk-engine";
export declare class RiskPredictionAgent {
    private readonly sourceItems;
    private readonly openLoops;
    private readonly tasks;
    private readonly risksRepo;
    private readonly audit;
    private readonly engine;
    constructor(sourceItems: SourceItemsRepository, openLoops: OpenLoopsRepository, tasks: TasksRepository, risksRepo: RisksRepository, audit: AuditLogger);
    scanAndPersist(): Promise<DetectedRisk[]>;
    formatTopAlerts(risks: DetectedRisk[], limit?: number): string[];
}
//# sourceMappingURL=risk-prediction-agent.d.ts.map