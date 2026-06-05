import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  ClassifiedIntent,
  HandleMessageOptions,
  InboundMessage,
  IntentClassifierPort,
  ToolContext,
} from "@hermes-os/shared";
import {
  findWorkspaceRoot,
  wantsShoppingOrLinks,
  isRefusalResponse,
  extractHttpsLinks,
  formatLinksFallback,
  needsAgentPlanner,
  needsBrowserAutonomy,
  throwIfAborted,
  sanitizeAssistantReply,
  isMessagingChannel,
  looksLikeLeakedReasoning,
  wantsExplicitTweet,
} from "@hermes-os/shared";
import { ModelRouter, loadCloudflareModelRoutes } from "@hermes-os/shared";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ActivityMonitor, AgentName } from "@hermes-os/audit-log";
import { getActivityReport, getAgentSummary } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { AuditRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type {
  AssistantStateRepository,
  OpenLoopsRepository,
  TasksRepository,
  ContextGraphService,
} from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";
import { wantsBrowserGmail } from "@hermes-os/connectors";
import {
  mapIntentToTaskKind,
  type AgentRunInput,
  type AgentRunOutput,
  type AgentToolRequest,
  type MemoryCandidate,
  type SkillCandidate,
} from "@hermes-os/agent-runtime";
import { RouterAgent } from "./router-agent.js";
import { OperatorAgent } from "./operator-agent.js";
import { ApprovalAgent } from "./approval-agent.js";
import {
  buildResearchFollowUpPrompt,
  isResearchFollowUpMessage,
  wantsOpenPurchaseInBrowser,
  pickPurchaseLink,
  type ResearchSession,
} from "./research-session.js";
import { browserGotoPayload } from "@hermes-os/tool-executor";
import { HindranceCoordinator } from "./hindrance-coordinator.js";
import { createAgentRuntime, type AgentRuntime } from "./agent-runtime.js";
import { classifySteeringRelevance } from "./steering-classifier.js";
import { ContextGraphAgent, isContextGraphQuery } from "./context-graph-agent.js";
import { isPresenceScanEnabled } from "@hermes-os/policies";
import { ConversationSessionStore } from "./conversation-sessions.js";

const MAX_COGNITIVE_TOOL_ROUNDS = 8;
const RUNTIME_CALL_TIMEOUT_MS = Number(process.env.HERMES_RUNTIME_TIMEOUT_MS ?? 45_000);

export class Orchestrator {
  private readonly router: RouterAgent;
  private readonly operator = new OperatorAgent();
  private readonly approvalAgent: ApprovalAgent;
  private readonly modelRouter: ModelRouter;
  private readonly agents: AgentRuntime;
  private readonly memoryService: MemoryService;
  private researchSession: ResearchSession | null = null;
  private readonly contextGraphAgent: ContextGraphAgent;
  private readonly conversations = new ConversationSessionStore();
  private lastRuntimeUsed = "local";

  constructor(
    private readonly broker: ApprovalBroker,
    private readonly executor: ToolExecutor,
    private readonly registry: ToolRegistry,
    private readonly audit: AuditLogger,
    private readonly activity: ActivityMonitor,
    private readonly hindrance: HindranceCoordinator,
    private readonly auditRepo: AuditRepository,
    private readonly stateRepo: AssistantStateRepository,
    private readonly tasksRepo: TasksRepository,
    private readonly openLoopsRepo: OpenLoopsRepository,
    private readonly workspaceRoot: string,
    agents: AgentRuntime,
    memoryService: MemoryService,
    intentClassifier?: IntentClassifierPort | null,
    contextGraph?: ContextGraphService,
  ) {
    this.contextGraphAgent = new ContextGraphAgent(contextGraph!);
    this.approvalAgent = new ApprovalAgent(broker, executor);
    this.modelRouter = new ModelRouter(
      loadCloudflareModelRoutes(resolve(workspaceRoot, "configs/cloudflare-models.yaml")),
    );
    this.agents = agents;
    this.memoryService = memoryService;
    this.router = new RouterAgent(intentClassifier ?? null);
  }

  async runMorningBrief(userMessage = ""): Promise<string> {
    return this.withAgent("ChiefOfStaffAgent", "morning_brief", userMessage, () =>
      this.agents.chiefOfStaff.runMorningBrief(userMessage),
    );
  }

  async runEveningReview(userMessage = ""): Promise<string> {
    return this.withAgent("ChiefOfStaffAgent", "evening_review", "", () =>
      this.agents.chiefOfStaff.runEveningReview(userMessage),
    );
  }

  async getActivityLog(limit = 40): Promise<string> {
    return getActivityReport(this.auditRepo, limit);
  }

  private async withAgent<T>(
    agent: AgentName,
    intent: string,
    messagePreview: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.activity.agentStart(agent, { intent, messagePreview });
    try {
      const result = await fn();
      const preview = typeof result === "string" ? result.slice(0, 200) : undefined;
      await this.activity.agentDone(agent, { preview });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.activity.agentDone(agent, { ok: false, error: msg });
      throw err;
    }
  }

  private async tryDirectCommand(text: string, ctx?: ToolContext): Promise<string | null> {
    const t = text.trim();
    if (/^daily\s+brief$/i.test(t) || /^morning\s+brief$/i.test(t)) {
      return this.runMorningBrief();
    }
    if (/^evening\s+review$/i.test(t)) {
      return this.runEveningReview();
    }
    if (/^(activity|logs|monitor)(\s+\d+)?$/i.test(t)) {
      const n = Number(t.match(/\d+/)?.[0] ?? 40);
      return this.getActivityLog(n);
    }
    if (/^show\s+approvals$/i.test(t)) {
      const pending = await this.broker.getPendingApprovals();
      if (pending.length === 0) return "No pending approvals.";
      return [
        "Pending approvals:",
        ...pending.map(
          (p) =>
            `- ${p.id} · ${p.actionType} · risk ${p.riskLevel} · expires ${p.expiresAt}`,
        ),
      ].join("\n");
    }
    if (/^what\s+could\s+go\s+wrong\s+today\??$/i.test(t)) {
      const risks = await this.agents.risk.scanAndPersist();
      const alerts = this.agents.risk.formatTopAlerts(risks, 5);
      return alerts.length ?
          ["Today's risks:", ...alerts].join("\n\n")
        : "No elevated risks detected in the latest scan.";
    }
    const researchMatch = /^research\s+(.+)/is.exec(t);
    const topic = researchMatch?.[1]?.trim();
    if (topic) {
      if (wantsShoppingOrLinks(topic)) {
        return this.handleResearch(topic, {
          intent: "research",
          confidence: 1,
          entities: { payloadText: topic },
        }, ctx ?? { actor: "user", workspaceRoot: this.workspaceRoot });
      }
      return this.handleSeriousTask(topic, {
        intent: "research",
        confidence: 1,
        entities: { payloadText: topic },
      }, ctx ?? { actor: "user", workspaceRoot: this.workspaceRoot });
    }
    return null;
  }

  /** Whether a mid-run user message should steer the active task vs start separately. */
  async isSteeringRelated(activeGoal: string, newMessage: string): Promise<boolean> {
    return classifySteeringRelevance(activeGoal, newMessage, this.agents.cloudflare);
  }

  async handleMessage(message: InboundMessage, options?: HandleMessageOptions): Promise<string> {
    try {
      throwIfAborted(options?.signal);

      await this.audit.log({
        eventType: "incoming_message",
        actor: message.senderId,
        payload: { channel: message.channel, text: message.text },
      });

    const state = await this.stateRepo.getState();
    if (state === "paused") {
      return "Assistant is paused. Ask to resume when ready.";
    }
    if (state === "emergency_stop") {
      return "Emergency stop active. Restart orchestrator process to reset.";
    }

    const ctx: ToolContext = {
      actor: message.senderId,
      workspaceRoot: this.workspaceRoot,
      channel: message.channel,
      conversationHistory:
        options?.conversationHistory ??
        this.conversations.getHistory(message.channel, message.senderId),
    };

    if (/^(?:\/new|new chat|clear chat)$/i.test(message.text.trim())) {
      this.conversations.clear(message.channel, message.senderId);
      return this.completeMessagingTurn(message, "Fresh thread — what's up?", options);
    }

    if (isContextGraphQuery(message.text)) {
      const reply = await this.contextGraphAgent.answer(message.text);
      return this.completeMessagingTurn(message, reply, options);
    }

    if (wantsBrowserControlledService(message.text)) {
      this.researchSession = null;
      const preview = message.text.slice(0, 120);
      const reply = await this.withAgent("LaptopControlAgent", "laptop_control", preview, () =>
        this.agents.laptop.run(message.text, undefined, ctx),
      );
      return this.completeMessagingTurn(message, reply, options);
    }

    const blockedResume = await this.agents.autonomous?.tryHandleUserGuidance(message.text, ctx);
    if (blockedResume) {
      return this.completeMessagingTurn(message, blockedResume, options);
    }

    const hindranceResume = await this.hindrance.tryResumeFromUser(message.text);
    if (hindranceResume) {
      return this.completeMessagingTurn(message, hindranceResume, options);
    }

    const loginResume = await this.agents.laptop.tryHandleCredentialReply(message.text, ctx);
    if (loginResume) {
      return this.completeMessagingTurn(message, loginResume, options);
    }

    await this.maybeAutoCaptureFacts(message.text, message.senderId);

    const direct = await this.tryDirectCommand(message.text, ctx);
    if (direct) {
      return this.completeMessagingTurn(message, direct, options);
    }

    const pending = await this.broker.getPendingApprovals();
    let classified = await this.router.classify(message.text, {
      activeResearchTopic: this.researchSession?.topic ?? null,
      pendingApprovalIds: pending.map((p) => p.id),
      assistantState: state,
    });

    if (
      this.researchSession &&
      classified.intent !== "research" &&
      classified.intent !== "approval_response" &&
      isResearchFollowUpMessage(message.text)
    ) {
      classified = {
        intent: "research",
        confidence: 0.85,
        entities: { researchContinue: true },
        reasoning: "Active research follow-up (links / personalization)",
      };
    }

    if (
      classified.intent === "unknown" &&
      wantsShoppingOrLinks(message.text) &&
      this.agents.research
    ) {
      classified = {
        intent: "research",
        confidence: 0.8,
        reasoning: "Shopping/link request routed to research",
      };
    }

    await this.audit.log({
      eventType: "intent_classified",
      actor: "assistant",
      payload: {
        intent: classified.intent,
        confidence: classified.confidence,
        reasoning: classified.reasoning,
      },
    });

    const controlReply = await this.tryAssistantControl(classified);
    if (controlReply) return this.completeMessagingTurn(message, controlReply, options);

    if (classified.entities?.researchEnd) {
      this.researchSession = null;
      return this.completeMessagingTurn(
        message,
        "Research session ended. Ask a new question anytime.",
        options,
      );
    }

    let reply: string;

    const preview = message.text.slice(0, 120);

    if (isMemoryRecallQuery(message.text)) {
      reply = await this.withAgent("GeneralAgent", "memory_recall", preview, () =>
        this.agents.general.run(message.text, ctx),
      );
    } else switch (classified.intent) {
      case "approval_response":
        reply = await this.withAgent("ApprovalAgent", classified.intent, preview, async () =>
          (await this.approvalAgent.handleIntent(classified.entities, ctx)).reply,
        );
        break;
      case "research":
        reply = await this.withAgent("ResearchAgent", classified.intent, preview, () =>
          wantsShoppingOrLinks(message.text)
            ? this.handleResearch(message.text, classified, ctx)
            : this.handleSeriousTask(message.text, classified, ctx),
        );
        break;
      case "memory_update":
        this.researchSession = null;
        reply = await this.withAgent("MemoryAgent", classified.intent, preview, () =>
          this.agents.memory.handle(message.text, classified.entities),
        );
        break;
      case "personal_ops":
        this.researchSession = null;
        reply = await this.withAgent("GeneralAgent", classified.intent, preview, () =>
          this.handleSeriousTask(message.text, classified, ctx),
        );
        break;
      case "browser_task":
        this.researchSession = null;
        reply = await this.withAgent("AutonomousAgent", classified.intent, preview, () =>
          this.handleSeriousTask(message.text, classified, ctx),
        );
        break;
      case "coding":
        this.researchSession = null;
        reply = await this.withAgent("CodingAgent", classified.intent, preview, () =>
          this.handleSeriousTask(
            classified.entities?.payloadText?.trim() || message.text,
            classified,
            ctx,
          ),
        );
        break;
      case "writing":
        this.researchSession = null;
        reply = await this.withAgent("WritingAgent", classified.intent, preview, () =>
          this.agents.writing.run(message.text, classified.entities, ctx, {
            send: classified.entities?.toolName === "imessage.send",
          }),
        );
        break;
      case "laptop_control": {
        this.researchSession = null;
        const tool = classified.entities?.toolName;
        if (tool === "terminal.run" || tool === "memory.remember" || tool === "memory.forget") {
          reply = await this.withAgent("OperatorAgent", classified.intent, preview, () =>
            this.executeToolPlan(classified, message.text, ctx),
          );
        } else if (wantsBrowserControlledService(message.text)) {
          reply = await this.withAgent("LaptopControlAgent", classified.intent, preview, () =>
            this.agents.laptop.run(message.text, classified.entities, ctx, {
              preferCompose: tool === "social.post" && wantsExplicitTweet(message.text),
            }),
          );
        } else {
          reply = await this.withAgent("AutonomousAgent", classified.intent, preview, () =>
            this.handleSeriousTask(message.text, classified, ctx),
          );
        }
        break;
      }
      case "unknown":
        reply = await this.handleUnknown(message.text, classified, ctx, options);
        break;
      default:
        reply = `Handler for ${classified.intent} is not wired.`;
    }

    reply = await this.recoverIfRefusal(message.text, reply, ctx, options);
    return this.completeMessagingTurn(message, reply, options);
    } catch (err) {
      throw err;
    }
  }

  private async handleUnknown(
    text: string,
    classified: ClassifiedIntent,
    ctx: ToolContext,
    msgOptions?: HandleMessageOptions,
  ): Promise<string> {
    if (this.researchSession && isResearchFollowUpMessage(text)) {
      return this.handleSeriousTask(text, {
        ...classified,
        intent: "research",
        entities: { ...classified.entities, researchContinue: true },
      }, ctx);
    }

    if (this.shouldRunAutonomous(text)) {
      if (wantsBrowserControlledService(text)) {
        return this.agents.laptop.run(text, classified.entities, ctx);
      }
      return this.runAutonomous(text, ctx, "browser_task", undefined, msgOptions, {
        forceBrowser: wantsBrowserControlledService(text),
      });
    }

    if (wantsShoppingOrLinks(text)) {
      return this.handleResearch(text, { ...classified, intent: "research" }, ctx);
    }

    return this.handleSeriousTask(text, classified, ctx);
  }

  private async recoverIfRefusal(
    text: string,
    reply: string,
    ctx: ToolContext,
    msgOptions?: HandleMessageOptions,
  ): Promise<string> {
    if (!isRefusalResponse(reply)) return reply;

    if (this.researchSession?.lastReply) {
      const links =
        this.researchSession.lastLinks ?? extractHttpsLinks(this.researchSession.lastReply);
      if (wantsOpenPurchaseInBrowser(text) && links.length) {
        const opened = await this.openPurchaseLinkInArc(text, links, ctx);
        const linkBlock = formatLinksFallback(links, "Links from our research:");
        return opened ? `${linkBlock}\n\n${opened}` : linkBlock;
      }
      if (links.length) {
        return formatLinksFallback(
          links,
          "Pulling the purchase links from our earlier research:",
        );
      }
      return this.handleResearch(text, {
        intent: "research",
        confidence: 1,
        entities: { researchContinue: true },
      }, ctx);
    }

    if (wantsShoppingOrLinks(text) && this.agents.research) {
      return this.handleResearch(text, { intent: "research", confidence: 1 }, ctx);
    }

    if (this.shouldRunAutonomous(text)) {
      return this.runAutonomous(text, ctx, "unknown", undefined, msgOptions);
    }

    const links = extractHttpsLinks(reply);
    if (links.length) return formatLinksFallback(links);

    return [
      "I'll handle this with your Mac (Arc + tools) instead of stopping here.",
      "",
      await this.agents.general.run(
        `${text}\n\n[Important: provide concrete https:// links or say you are opening Arc — do not refuse.]`,
        ctx,
      ),
    ].join("\n");
  }

  private async executeToolPlan(
    classified: ClassifiedIntent,
    text: string,
    ctx: ToolContext,
  ): Promise<string> {
    const invocation = this.operator.plan(classified.intent, text, classified.entities);
    if (!invocation) {
      return `${classified.intent} needs a tool plan from the classifier (toolName entity).`;
    }

    const result = await this.executor.invoke(
      invocation.toolName,
      invocation.payload,
      ctx,
      {
        summary: invocation.summary,
        targetPath: invocation.targetPath,
        terminalCommand: invocation.terminalCommand,
      },
    );

    if (result.status === "pending_approval") return result.message;
    if (result.status === "denied") return `Denied: ${result.reason}`;
    return `Done: ${JSON.stringify(result.data)}`;
  }

  private async handleSeriousTask(
    text: string,
    classified: ClassifiedIntent,
    ctx: ToolContext,
  ): Promise<string> {
    const runtime = await this.agents.cognitive.router.choose(classified.intent);
    if (!runtime) {
      this.lastRuntimeUsed = "local";
      return this.fallbackSeriousTask(text, classified, ctx);
    }

    const input = await this.buildRuntimeInput(text, classified, ctx);
    let result: AgentRunOutput;

    try {
      this.lastRuntimeUsed = runtime.kind;
      await this.audit.log({
        eventType: "agent_invoked",
        actor: "assistant",
        payload: { runtime: runtime.kind, taskKind: input.taskKind, intent: classified.intent },
      });
      result = await withTimeout(
        runtime.run(input),
        RUNTIME_CALL_TIMEOUT_MS,
        `${runtime.kind} initial run`,
      );
    } catch (err) {
      await this.audit.log({
        eventType: "agent_finished",
        actor: "assistant",
        result: {
          runtime: runtime.kind,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return this.fallbackSeriousTask(text, classified, ctx);
    }

    for (let round = 0; round < MAX_COGNITIVE_TOOL_ROUNDS; round++) {
      if (!result.toolRequests?.length) break;

      const toolResults = [];
      for (const request of result.toolRequests) {
        const toolResult = await this.executeCognitiveToolRequest(request, ctx);
        toolResults.push({ request, result: toolResult });
        if (toolResult.status === "pending_approval") {
          await this.processRuntimeCandidates(result);
          return toolResult.message;
        }
      }

      const sessionId = result.sessionId ?? input.sessionId ?? `${runtime.kind}-session`;
      const continuationInput: AgentRunInput = {
        ...input,
        sessionId,
        userMessage: `Tool results:\n${JSON.stringify(toolResults, null, 2)}`,
      };

      await this.audit.log({
        eventType: "agent_step",
        actor: "assistant",
        payload: { runtime: runtime.kind, round: round + 1, toolResults },
      });
      try {
        result = await withTimeout(
          runtime.continue(sessionId, continuationInput),
          RUNTIME_CALL_TIMEOUT_MS,
          `${runtime.kind} continuation`,
        );
      } catch (err) {
        await this.audit.log({
          eventType: "agent_finished",
          actor: "assistant",
          result: {
            runtime: runtime.kind,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
            round: round + 1,
          },
        });
        return this.fallbackSeriousTask(text, classified, ctx);
      }
    }

    await this.processRuntimeCandidates(result);

    if (classified.intent === "research" && result.final) {
      const topic = classified.entities?.payloadText?.trim() || text.trim();
      this.researchSession = {
        topic,
        lastReply: result.final,
        lastLinks: extractHttpsLinks(result.final),
      };
    }

    await this.audit.log({
      eventType: "agent_finished",
      actor: "assistant",
      result: {
        runtime: runtime.kind,
        ok: true,
        reasoningSummary: result.reasoningSummary,
      },
    });

    if (result.final?.trim()) return result.final.trim();
    if (result.toolRequests?.length) {
      return "I hit the tool-round limit before finishing. I stopped safely before taking more actions.";
    }
    return "I could not complete that with the configured agent runtimes.";
  }

  private async buildRuntimeInput(
    text: string,
    classified: ClassifiedIntent,
    ctx: ToolContext,
  ): Promise<AgentRunInput> {
    const memories = await this.memoryService.searchForContext(text, 10);
    const openLoops = await this.openLoopsRepo.listOpen(10);
    const openTasks = await this.tasksRepo.listOpen(10);
    const availableTools = this.agents.cognitive.toolCatalog;

    return {
      taskKind: this.mapClassifiedIntentToRuntimeTask(classified.intent),
      userMessage: text,
      systemContext: {
        relevantMemories: memories,
        dailyContext: {
          channel: ctx.channel,
          conversationHistory: ctx.conversationHistory?.slice(-8) ?? [],
        },
        activeProjects: openTasks,
        openLoops,
        availableTools,
        riskPolicySummary:
          "All local tools must be requested as JSON and executed only by Hermes Personal OS ToolExecutor. Unknown tools are denied. High-risk actions require ApprovalBroker capability leases. Raw secrets are never exposed to runtimes.",
      },
      constraints: {
        mustUseToolExecutor: true,
        mustRequestApprovalForHighRisk: true,
        cannotAccessRawSecrets: true,
      },
    };
  }

  private mapClassifiedIntentToRuntimeTask(intent: ClassifiedIntent["intent"]) {
    if (intent === "laptop_control") return "browser_task";
    return mapIntentToTaskKind(intent);
  }

  private async executeCognitiveToolRequest(
    request: AgentToolRequest,
    ctx: ToolContext,
  ): Promise<Awaited<ReturnType<ToolExecutor["invoke"]>>> {
    if (!this.registry.has(request.toolName)) {
      return { status: "denied", reason: `Tool not registered: ${request.toolName}` };
    }
    if (payloadContainsCapabilityBypass(request.payload)) {
      return {
        status: "denied",
        reason: "Runtime tool payloads may not include approvalId or capability lease fields.",
      };
    }

    return this.executor.invoke(request.toolName, request.payload ?? {}, ctx, {
      summary: request.reason,
      targetPath: runtimePayloadPath(request.payload),
      terminalCommand:
        request.toolName === "terminal.run" &&
        typeof request.payload === "object" &&
        request.payload !== null &&
        "command" in request.payload
          ? String((request.payload as { command?: unknown }).command ?? "")
          : undefined,
    });
  }

  private async processRuntimeCandidates(result: AgentRunOutput): Promise<void> {
    for (const candidate of result.memoryCandidates ?? []) {
      await this.processMemoryCandidate(candidate);
    }
    for (const candidate of result.skillCandidates ?? []) {
      await this.saveSkillCandidateDraft(candidate);
    }
  }

  private async processMemoryCandidate(candidate: MemoryCandidate): Promise<void> {
    if (!candidate.content.trim()) return;
    if (candidate.content.match(/\b(api[_-]?key|secret|password|token|oauth|bearer)\b/i)) {
      return;
    }
    if (candidate.sensitivity !== "normal" || candidate.confidence !== "high") {
      return;
    }
    await this.memoryService.remember({
      content: candidate.content,
      memoryType: candidate.type,
      scope: candidate.scope,
      source: "hermes-runtime",
      evidence: `Runtime memory candidate (${candidate.confidence})`,
    });
  }

  private async saveSkillCandidateDraft(candidate: SkillCandidate): Promise<void> {
    const slug = candidate.name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    if (!slug) return;
    const dir = join(this.workspaceRoot, "data", "skill-candidates");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${slug}.json`),
      `${JSON.stringify({ ...candidate, status: "draft", createdAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8",
    );
  }

  private async fallbackSeriousTask(
    text: string,
    classified: ClassifiedIntent,
    ctx: ToolContext,
  ): Promise<string> {
    switch (classified.intent) {
      case "research":
        return this.handleResearch(text, classified, ctx);
      case "coding":
        return this.agents.coding.run(classified.entities?.payloadText?.trim() || text, ctx);
      case "browser_task":
        return this.runAutonomous(text, ctx, "browser_task");
      case "laptop_control":
        return this.agents.laptop.run(text, classified.entities, ctx);
      case "personal_ops":
      case "writing":
      case "unknown":
        return this.agents.general.run(text, ctx);
      case "memory_update":
        return this.agents.memory.handle(text, classified.entities);
      case "approval_response":
      case "status":
        return "That command is handled locally.";
    }
  }

  private async tryAssistantControl(classified: ClassifiedIntent): Promise<string | null> {
    if (classified.intent !== "status") return null;

    const control = classified.entities?.assistantControl;
    if (control === "pause") {
      await this.stateRepo.setState("paused");
      return "Paused.";
    }
    if (control === "resume") {
      await this.stateRepo.setState("running");
      return "Resumed.";
    }
    if (control === "emergency_stop") {
      await this.stateRepo.setState("emergency_stop");
      return "Emergency stop engaged. All actions halted.";
    }
    return this.buildStatus();
  }

  private async handleResearch(
    text: string,
    classified: ClassifiedIntent,
    ctx: ToolContext,
  ): Promise<string> {
    const prior = this.researchSession;
    const continueThread =
      Boolean(prior) &&
      classified.entities?.researchContinue !== false &&
      classified.entities?.researchEnd !== true;

    let query: string;
    let topic: string;

    if (continueThread && prior) {
      topic = prior.topic;
      if (wantsOpenPurchaseInBrowser(text) && prior.lastLinks?.length) {
        const opened = await this.openPurchaseLinkInArc(text, prior.lastLinks, ctx);
        const linkLine = pickPurchaseLink(prior.lastLinks, text) ?? prior.lastLinks[0];
        query = buildResearchFollowUpPrompt(topic, text, prior.lastReply);
        let reply: string;
        if (this.agents.research) {
          try {
            reply = await this.agents.research.run(query, {
              memoryTopic: topic,
              isFollowUp: true,
            });
          } catch (err) {
            reply = `Research failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        } else {
          reply = "Research requires Cloudflare credentials in .env.";
        }
        const lastLinks = extractHttpsLinks(reply);
        this.researchSession = {
          topic,
          lastReply: reply,
          lastLinks: lastLinks.length ? lastLinks : prior.lastLinks,
        };
        const openNote = opened ?? `Opened in Arc: ${linkLine}`;
        return `${openNote}\n\n${reply}\n\n(Send more details to continue, or ask to end research.)`;
      }
      query = buildResearchFollowUpPrompt(topic, text, prior.lastReply);
    } else {
      topic = classified.entities?.payloadText?.trim() || text.trim();
      query = topic;
      this.researchSession = { topic };
    }

    await this.audit.log({
      eventType: "research_started",
      actor: "assistant",
      payload: {
        text,
        topic,
        followUp: continueThread,
        model: this.modelRouter.resolve("research"),
      },
    });

    let reply: string;
    if (this.agents.research) {
      try {
        reply = await this.agents.research.run(query, {
          memoryTopic: topic,
          isFollowUp: continueThread,
        });
      } catch (err) {
        reply = `Research failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      reply = "Research requires Cloudflare credentials in .env.";
    }

    const lastLinks = extractHttpsLinks(reply);
    this.researchSession = { topic, lastReply: reply, lastLinks };

    if (wantsOpenPurchaseInBrowser(text) && lastLinks.length) {
      const opened = await this.openPurchaseLinkInArc(text, lastLinks, ctx);
      if (opened) reply += `\n\n${opened}`;
    }

    reply += "\n\n(Send more details to continue, or ask to end research.)";

    await this.audit.log({ eventType: "research_completed", actor: "assistant", result: { ok: true } });
    return reply;
  }

  private async openPurchaseLinkInArc(
    text: string,
    links: string[],
    ctx: ToolContext,
  ): Promise<string | null> {
    const url = pickPurchaseLink(links, text);
    if (!url) return null;

    const result = await this.executor.invoke(
      "browser.goto",
      browserGotoPayload(url),
      ctx,
      { summary: `Open purchase link in Arc` },
    );
    if (result.status === "pending_approval") return result.message;
    if (result.status === "denied") return `Could not open Arc: ${result.reason}`;
    return `Opened in Arc: ${url}`;
  }

  private async fetchDaemonHealth(): Promise<string> {
    const port = process.env.HERMES_DAEMON_PORT ?? "3850";
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return "unreachable";
      const body = (await res.json()) as {
        status?: string;
        scheduler?: string;
        notificationCenter?: string;
      };
      return `${body.status ?? "unknown"} (scheduler ${body.scheduler ?? "?"}, notifications ${body.notificationCenter ?? "?"})`;
    } catch {
      return "not running";
    }
  }

  private async buildStatus(): Promise<string> {
    const state = await this.stateRepo.getState();
    const pending = await this.broker.getPendingApprovals();
    const lastScan = await this.stateRepo.getLastScanAt();
    const daemonHealth = await this.fetchDaemonHealth();
    const memoryCount = await this.memoryService.count();
    const openLoops = await this.openLoopsRepo.countOpen();
    const openTasks = await this.tasksRepo.countOpen();
    const activeRisks = await this.agents.risk.scanAndPersist();
    const activeHindrance = await this.hindrance.getActive();
    const summary = await getAgentSummary(this.auditRepo, 100);
    const hermesOk = this.agents.hermes ? await this.agents.hermes.healthCheck() : false;
    const cfOk = this.agents.cloudflare ? await this.agents.cloudflare.healthCheck() : false;
    const cognitiveRuntime =
      hermesOk ? "Hermes Gateway" : cfOk ? "Cloudflare fallback" : "local fallback only";

    return [
      `Assistant: ${state}`,
      `Daemon: ${daemonHealth}`,
      `Primary cognitive runtime: ${cognitiveRuntime}`,
      `Last runtime used: ${this.lastRuntimeUsed}`,
      `Pending approvals: ${pending.length}`,
      `Last scan: ${lastScan ?? "never"}`,
      `Open loops: ${openLoops}`,
      `Open tasks: ${openTasks}`,
      `Active risks: ${activeRisks.length}`,
      `Digital presence: browser scan (Gmail/X/LinkedIn/Calendar in Arc)`,
      `Connectors: screen + calendar + files${process.env.GMAIL_ACCESS_TOKEN ? " + gmail API" : ""}`,
      `Memories: ${memoryCount}`,
      `Hermes gateway: ${hermesOk ? "up" : "down/unconfigured"}`,
      `Cloudflare AI: ${cfOk ? "up" : "down/unconfigured"}`,
      `ToolExecutor: ok`,
      `ApprovalBroker: ok`,
      `Intent detection: model-based (configs/intents.yaml)`,
      `Observation: connector scan (screen/calendar/files; Gmail if token set)`,
      `Research session: ${this.researchSession?.topic ?? "none"}`,
      `Supermemory: ${"supermemoryEnabled" in this.memoryService && this.memoryService.supermemoryEnabled ? "on" : "off (set SUPERMEMORY_API_KEY)"}`,
      "",
      "Recent agents:",
      summary.agents.length ? summary.agents.join(", ") : "(none yet)",
      "Recent tools:",
      summary.tools.slice(0, 12).join(", ") || "(none)",
      "Activity log: send `logs` in chat or `pnpm logs`",
      `JSONL tail: data/activity.jsonl`,
      activeHindrance ?
        `\nPaused waiting for you: ${activeHindrance.issue}\nReply "continue" when fixed.`
      : "",
    ].join("\n");
  }

  private shouldRunAutonomous(text: string): boolean {
    return Boolean(this.agents.autonomous) && (needsBrowserAutonomy(text) || needsAgentPlanner(text));
  }

  private async runAutonomous(
    text: string,
    ctx: ToolContext,
    classification: import("@hermes-os/shared").RequestClassification,
    entities?: import("@hermes-os/shared").IntentEntities,
    msgOptions?: HandleMessageOptions,
    runOptions?: { forceBrowser?: boolean },
  ): Promise<string> {
    if (!this.agents.autonomous) {
      return this.agents.laptop.run(text, entities, ctx);
    }
    const goal =
      entities?.payloadText?.trim() ?
        `${text}\nTarget: ${entities.payloadText}`
      : text;
    return this.agents.autonomous.run(goal, ctx, {
      classification,
      signal: msgOptions?.signal,
      steerController: msgOptions?.steerController,
      forceBrowser: runOptions?.forceBrowser,
    });
  }

  /** Proactive: scan one digital surface via Arc (called from scheduler). */
  async runPresenceScan(ctx: ToolContext): Promise<string | null> {
    if (!isPresenceScanEnabled()) return null;
    if (process.env.HERMES_DISABLE_PRESENCE_SCAN === "1") return null;
    if (await this.hindrance.shouldSkipBackgroundTask("vision")) return null;

    const result = await this.agents.presence.scanNext(ctx);
    if (result.error?.includes("approval")) return null;

    const visionFailed =
      /^vision api failed|^vision returned empty|^could not read screenshot/i.test(result.summary);

    if (visionFailed) {
      await this.hindrance.reportAndNotify({
        category: "vision",
        issue: `Digital presence scan failed for ${result.service}.`,
        question:
          "I could not read the screen after opening Arc. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env, and grant Screen Recording to Terminal/Cursor if prompted.",
        resolutionHint: "Reply continue when Cloudflare AI and screen capture work.",
        agent: "DigitalPresenceMonitor",
      });
      return null;
    }

    const lines = [
      `[Presence: ${result.service}]`,
      result.summary,
      result.openLoops.length ? `Open loops: ${result.openLoops.join("; ")}` : "",
      result.risks.length ? `Risks: ${result.risks.join("; ")}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  async isProactivePaused(): Promise<boolean> {
    return this.hindrance.shouldSkipBackgroundTask();
  }

  private formatOutgoingReply(
    reply: string,
    channel: InboundMessage["channel"],
  ): string {
    if (!isMessagingChannel(channel)) return reply;
    const cleaned = sanitizeAssistantReply(reply);
    if (cleaned) return cleaned;
    if (looksLikeLeakedReasoning(reply)) {
      return "One sec — let me try that again. Can you rephrase?";
    }
    return reply;
  }

  private async completeMessagingTurn(
    message: InboundMessage,
    reply: string,
    options?: HandleMessageOptions,
  ): Promise<string> {
    const out = this.formatOutgoingReply(reply, message.channel);
    if (isMessagingChannel(message.channel) && !options?.skipSessionAppend) {
      this.conversations.appendTurn(
        message.channel,
        message.senderId,
        message.text,
        out,
      );
    }
    await this.audit.log({
      eventType: "outgoing_message",
      actor: "assistant",
      payload: { text: out.slice(0, 500) },
    });
    return out;
  }

  private async maybeAutoCaptureFacts(text: string, senderId: string): Promise<void> {
    if (/\b(remember|forget|memory)\b/i.test(text)) return;

    const trimmed = text.trim().slice(0, 500);
    if (!trimmed) return;

    const locationMatch = trimmed.match(
      /\b(?:i(?:'m| am) (?:from|in)|i live in|located in|my (?:home|city|address) is)\s+(.+)/i,
    );
    if (locationMatch?.[1]) {
      await this.storeAutoFact(
        `User lives in ${locationMatch[1].trim().replace(/[.!?]+$/, "")}`,
        "durable_facts",
        senderId,
        "auto-captured location",
      );
      return;
    }

    if (await this.assistantRecentlyAskedForLocation()) {
      if (trimmed.length <= 120 && !trimmed.includes("?")) {
        await this.storeAutoFact(
          `User location: ${trimmed.replace(/[.!?]+$/, "")}`,
          "durable_facts",
          senderId,
          "location reply after assistant question",
        );
        return;
      }
    }

    if (
      /\b(i am|i'm|i prefer|side sleeper|back sleeper|stomach sleeper|medium soft|medium firm|firm pillow|soft pillow)\b/i.test(
        trimmed,
      )
    ) {
      await this.storeAutoFact(trimmed, "preferences", senderId, "auto-captured preference");
    }
  }

  private async assistantRecentlyAskedForLocation(): Promise<boolean> {
    const rows = await this.auditRepo.listFiltered({
      limit: 8,
      eventTypes: ["outgoing_message"],
    });
    const latest = rows[0];
    if (!latest?.payload) return false;
    try {
      const payload = JSON.parse(latest.payload) as { text?: string };
      const reply = (payload.text ?? "").toLowerCase();
      return /\b(where (do you|are you) live|what(?:'s| is) your (location|city)|where (are you|am i) located|tell me where you live|share your (location|city))\b/.test(
        reply,
      );
    } catch {
      return false;
    }
  }

  private async storeAutoFact(
    content: string,
    memoryType: string,
    senderId: string,
    evidence: string,
  ): Promise<void> {
    try {
      await this.memoryService.remember({
        content,
        memoryType,
        source: senderId,
        evidence,
      });
    } catch {
      /* non-fatal */
    }
  }
}

function payloadContainsCapabilityBypass(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.some(payloadContainsCapabilityBypass);

  const obj = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const normalized = key.toLowerCase();
    if (
      normalized === "approvalid" ||
      normalized === "leaseid" ||
      normalized === "capabilitylease" ||
      normalized === "capabilityleaseid"
    ) {
      return true;
    }
    if (payloadContainsCapabilityBypass(value)) return true;
  }
  return false;
}

function runtimePayloadPath(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  const path = (payload as { path?: unknown; targetPath?: unknown }).path ??
    (payload as { targetPath?: unknown }).targetPath;
  return typeof path === "string" ? path : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function createWorkspaceRoot(): string {
  if (process.env.HERMES_OS_ROOT) {
    return resolve(process.env.HERMES_OS_ROOT);
  }
  return findWorkspaceRoot();
}

/** Third-party accounts and websites — always laptop control, never API connectors. */
export function messageNeedsLaptopControl(text: string): boolean {
  return /\b(gmail|google mail|inbox|unread email|calendar|schedule|twitter|linkedin|slack|notion|drive|amazon|github|sign in|log in|open\s+https?:\/\/|check my)\b/i.test(
    text,
  );
}

/** Explicit browser/Arc/login requests should not be silently converted to API connector tasks. */
export function wantsBrowserControlledService(text: string): boolean {
  return (
    wantsBrowserGmail(text) ||
    (messageNeedsLaptopControl(text) &&
      /\b(browser|arc|playwright|chromium|login|log in|logged in|open|show|use)\b/i.test(text))
  );
}

/** Questions about stored user facts — must hit memory, not morning brief or research. */
export function isMemoryRecallQuery(text: string): boolean {
  return /\b(where (?:do i|am i) live|what(?:'s| is) my (?:location|city|address|home)|where am i (?:from|located)|do you know where i live|what do you (?:know|remember) about me)\b/i.test(
    text.trim(),
  );
}
