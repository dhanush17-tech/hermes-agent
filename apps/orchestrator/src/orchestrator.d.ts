import type { HandleMessageOptions, InboundMessage, IntentClassifierPort, ToolContext } from "@hermes-os/shared";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { AuditRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { AssistantStateRepository, OpenLoopsRepository, TasksRepository, ContextGraphService } from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";
import { HindranceCoordinator } from "./hindrance-coordinator.js";
import { type AgentRuntime } from "./agent-runtime.js";
export declare class Orchestrator {
    private readonly broker;
    private readonly executor;
    private readonly registry;
    private readonly audit;
    private readonly activity;
    private readonly hindrance;
    private readonly auditRepo;
    private readonly stateRepo;
    private readonly tasksRepo;
    private readonly openLoopsRepo;
    private readonly workspaceRoot;
    private readonly router;
    private readonly operator;
    private readonly approvalAgent;
    private readonly modelRouter;
    private readonly agents;
    private readonly memoryService;
    private researchSession;
    private readonly contextGraphAgent;
    private readonly conversations;
    constructor(broker: ApprovalBroker, executor: ToolExecutor, registry: ToolRegistry, audit: AuditLogger, activity: ActivityMonitor, hindrance: HindranceCoordinator, auditRepo: AuditRepository, stateRepo: AssistantStateRepository, tasksRepo: TasksRepository, openLoopsRepo: OpenLoopsRepository, workspaceRoot: string, agents: AgentRuntime, memoryService: MemoryService, intentClassifier?: IntentClassifierPort | null, contextGraph?: ContextGraphService);
    runMorningBrief(userMessage?: string): Promise<string>;
    runEveningReview(userMessage?: string): Promise<string>;
    getActivityLog(limit?: number): Promise<string>;
    private withAgent;
    private tryDirectCommand;
    /** Whether a mid-run user message should steer the active task vs start separately. */
    isSteeringRelated(activeGoal: string, newMessage: string): Promise<boolean>;
    handleMessage(message: InboundMessage, options?: HandleMessageOptions): Promise<string>;
    private handleUnknown;
    private recoverIfRefusal;
    private executeToolPlan;
    private tryAssistantControl;
    private handleResearch;
    private openPurchaseLinkInArc;
    private fetchDaemonHealth;
    private buildStatus;
    private shouldRunAutonomous;
    private runAutonomous;
    /** Proactive: scan one digital surface via Arc (called from scheduler). */
    runPresenceScan(ctx: ToolContext): Promise<string | null>;
    isProactivePaused(): Promise<boolean>;
    private formatOutgoingReply;
    private completeMessagingTurn;
    private maybeAutoCaptureFacts;
    private assistantRecentlyAskedForLocation;
    private storeAutoFact;
}
export declare function createWorkspaceRoot(): string;
/** Third-party accounts and websites — always laptop control, never API connectors. */
export declare function messageNeedsLaptopControl(text: string): boolean;
/** Questions about stored user facts — must hit memory, not morning brief or research. */
export declare function isMemoryRecallQuery(text: string): boolean;
//# sourceMappingURL=orchestrator.d.ts.map