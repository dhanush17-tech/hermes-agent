import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { AuditRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { MemoryService } from "@hermes-os/memory";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import { ApprovalAgent } from "./approval-agent.js";
import { ConversationSessionStore } from "./conversation-sessions.js";
import { CommandRouter } from "./command-router.js";
import { TaskRunner } from "./task-runner.js";
import { AutonomousAgentV2 } from "./agents/autonomous-agent.js";
import type { HindranceCoordinator } from "./hindrance-coordinator.js";

export function wireOrchestratorServices(deps: {
  broker: ApprovalBroker;
  executor: ToolExecutor;
  audit: AuditLogger;
  activity: ActivityMonitor;
  hindrance: HindranceCoordinator;
  auditRepo: AuditRepository;
  stateRepo: AssistantStateRepository;
  memoryService: MemoryService;
  workspaceRoot: string;
  runMorningBrief: () => Promise<string>;
  runEveningReview: () => Promise<string>;
  getActivityLog: (limit: number) => Promise<string>;
  buildStatus: () => Promise<string>;
}) {
  const approvalAgent = new ApprovalAgent(deps.broker, deps.executor);
  const conversations = new ConversationSessionStore();
  const autonomousAgent = new AutonomousAgentV2(deps.executor, deps.workspaceRoot);

  const commandRouter = new CommandRouter({
    broker: deps.broker,
    stateRepo: deps.stateRepo,
    memoryService: deps.memoryService,
    auditRepo: deps.auditRepo,
    workspaceRoot: deps.workspaceRoot,
    conversations,
    runMorningBrief: deps.runMorningBrief,
    runEveningReview: deps.runEveningReview,
    getActivityLog: deps.getActivityLog,
    buildStatus: deps.buildStatus,
    approvalAgent,
  });

  const taskRunner = new TaskRunner({
    broker: deps.broker,
    executor: deps.executor,
    memoryService: deps.memoryService,
    stateRepo: deps.stateRepo,
    approvalAgent,
    autonomousAgent,
    workspaceRoot: deps.workspaceRoot,
    buildStatus: deps.buildStatus,
  });

  return {
    approvalAgent,
    conversations,
    commandRouter,
    taskRunner,
    autonomousAgent,
  };
}
