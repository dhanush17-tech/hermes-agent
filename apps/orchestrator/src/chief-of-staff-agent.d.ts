import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { ContextGraphService } from "@hermes-os/context-graph";
import type { AssistantStateRepository, OpenLoopsRepository, RisksRepository, SourceItemsRepository, TasksRepository } from "@hermes-os/context-graph";
import type { ConnectorHub } from "@hermes-os/connectors";
import type { ProactivityPolicy } from "@hermes-os/policies";
import type { DetectedRisk } from "@hermes-os/risk-engine";
export declare class ChiefOfStaffAgent {
    private readonly tasks;
    private readonly openLoops;
    private readonly sourceItems;
    private readonly risksRepo;
    private readonly stateRepo;
    private readonly policy;
    private readonly hub;
    private readonly cf;
    private readonly contextGraph;
    private readonly riskEngine;
    constructor(tasks: TasksRepository, openLoops: OpenLoopsRepository, sourceItems: SourceItemsRepository, risksRepo: RisksRepository, stateRepo: AssistantStateRepository, policy: ProactivityPolicy, hub: ConnectorHub | null, cf: CloudflareWorkersAIClient | null, contextGraph?: ContextGraphService | null);
    syncContextFromConnectors(): Promise<{
        ingested: number;
        risks: DetectedRisk[];
    }>;
    runMorningBrief(userMessage?: string): Promise<string>;
    runEveningReview(userMessage?: string): Promise<string>;
    /** @deprecated use runMorningBrief */
    runBrief(userMessage: string): Promise<string>;
    private syncContextFromSources;
    private extractOpenLoopsFromSources;
    runRiskPrediction(): Promise<DetectedRisk[]>;
    private formatBrief;
}
//# sourceMappingURL=chief-of-staff-agent.d.ts.map