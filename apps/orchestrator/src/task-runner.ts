import type { HandleMessageOptions, InboundMessage, ToolContext } from "@hermes-os/shared";
import type { IntentResult, MemoryCandidate } from "@hermes-os/llm-client";
import type { InjectedContext } from "@hermes-os/memory";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { MemoryService } from "@hermes-os/memory";
import { ApprovalAgent } from "./approval-agent.js";
import {
  AutonomousAgentV2,
  runCodingAgent,
  runMemoryAgent,
  runPrimaryAgent,
  runResearchAgent,
  runWritingAgent,
} from "./agents/index.js";
import { parseApprovalCommand, parsedApprovalToEntities } from "./approval-command-parser.js";
import { routingIntentForMessage } from "./live-lookup.js";

export type TaskRunnerResult = {
  response: string;
  memoryCandidates?: MemoryCandidate[];
};

export type TaskRunnerDeps = {
  broker: ApprovalBroker;
  executor: ToolExecutor;
  memoryService: MemoryService;
  stateRepo: AssistantStateRepository;
  approvalAgent: ApprovalAgent;
  autonomousAgent: AutonomousAgentV2;
  workspaceRoot: string;
  buildStatus: () => Promise<string>;
};

export class TaskRunner {
  constructor(private readonly deps: TaskRunnerDeps) {}

  async run(
    message: InboundMessage,
    ctx: ToolContext,
    intent: IntentResult,
    memCtx: InjectedContext,
    _options?: HandleMessageOptions,
  ): Promise<TaskRunnerResult> {
    const blockedResume = await this.deps.autonomousAgent.tryHandleUserGuidance(message.text, ctx);
    if (blockedResume) {
      return { response: blockedResume.response, memoryCandidates: blockedResume.memoryCandidates };
    }

    const approvalParsed = parseApprovalCommand(message.text);
    if (approvalParsed || intent.intent === "approval_response") {
      const entities = approvalParsed
        ? parsedApprovalToEntities(approvalParsed)
        : undefined;
      if (entities?.approvalId === "__latest__") {
        const pending = await this.deps.broker.getPendingApprovals();
        if (pending[0]) entities.approvalId = pending[0].id;
      }
      const result = await this.deps.approvalAgent.handleIntent(entities, ctx);
      return { response: result.reply };
    }

    if (intent.intent === "status") {
      return { response: await this.deps.buildStatus() };
    }

    const routedIntent = routingIntentForMessage(intent, message.text);

    switch (routedIntent) {
      case "memory_update": {
        const result = await runMemoryAgent(message.text, this.deps.memoryService);
        return { response: result.response };
      }
      case "research":
      case "browser_task": {
        const result = await runResearchAgent(message.text, ctx, {
          executor: this.deps.executor,
          memCtx,
          memoryService: this.deps.memoryService,
          workspaceRoot: this.deps.workspaceRoot,
        });
        return { response: result.response, memoryCandidates: result.memoryCandidates };
      }
      case "coding": {
        const response = await runCodingAgent(message.text, ctx, {
          executor: this.deps.executor,
          memCtx,
        });
        return { response };
      }
      case "writing": {
        const response = await runWritingAgent(message.text, memCtx);
        return { response };
      }
      case "laptop_control": {
        const result = await this.deps.autonomousAgent.run(message.text, ctx, { systemBlock: memCtx.systemBlock });
        return { response: result.response, memoryCandidates: result.memoryCandidates };
      }
      case "personal_ops":
      case "unknown":
      default: {
        const result = await runPrimaryAgent(message.text, ctx, {
          executor: this.deps.executor,
          workspaceRoot: this.deps.workspaceRoot,
          memCtx,
        });
        return { response: result.response, memoryCandidates: result.memoryCandidates };
      }
    }
  }
}
