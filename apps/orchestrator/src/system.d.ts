import { AuditRepository, AssistantStateRepository, TasksRepository, OpenLoopsRepository, SourceItemsRepository, type ContextGraphService } from "@hermes-os/context-graph";
import { AuditLogger, ActivityMonitor } from "@hermes-os/audit-log";
import { ApprovalBroker } from "@hermes-os/approval-broker";
import { loadProactivityPolicy } from "@hermes-os/policies";
import { ToolExecutor } from "@hermes-os/tool-executor";
import { type IntentClassifierPort } from "@hermes-os/shared";
import { type HybridMemoryService } from "@hermes-os/memory";
import { createDefaultConnectorHub } from "@hermes-os/connectors";
import { Orchestrator } from "./orchestrator.js";
import { HindranceCoordinator } from "./hindrance-coordinator.js";
export type PersonalOsSystem = {
    orchestrator: Orchestrator;
    broker: ApprovalBroker;
    executor: ToolExecutor;
    memory: HybridMemoryService;
    dbPath: string;
    audit: AuditLogger;
    activity: ActivityMonitor;
    hindrance: HindranceCoordinator;
    auditRepo: AuditRepository;
    stateRepo: AssistantStateRepository;
    sourceItemsRepo: SourceItemsRepository;
    openLoopsRepo: OpenLoopsRepository;
    tasksRepo: TasksRepository;
    contextGraph: ContextGraphService;
};
export type ProactiveServices = {
    audit: AuditLogger;
    sourceItems: SourceItemsRepository;
    stateRepo: AssistantStateRepository;
    policy: ReturnType<typeof loadProactivityPolicy>;
    connectorHub: ReturnType<typeof createDefaultConnectorHub>;
};
export declare function bootstrapPersonalOs(options?: {
    databasePath?: string;
    workspaceRoot?: string;
    approvalTtlSeconds?: number;
    now?: () => Date;
    intentClassifier?: IntentClassifierPort | null;
}): PersonalOsSystem;
export declare function createProactiveServices(workspaceRoot: string): ProactiveServices;
//# sourceMappingURL=system.d.ts.map