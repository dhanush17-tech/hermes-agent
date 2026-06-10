import type { HandleMessageOptions, InboundMessage, ToolContext } from "@hermes-os/shared";
import { throwIfAborted } from "@hermes-os/shared";
import { redactSecretsFromText } from "@hermes-os/credentials";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { getActivityReport } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { AuditRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { MemoryService, InjectedContext } from "@hermes-os/memory";
import { injectMemoryContext, captureMemoryCandidates } from "@hermes-os/memory";
import type { SkillRegistry, SkillRunner, SkillRunResult } from "@hermes-os/skills";
import { matchSkills } from "@hermes-os/skills";
import { classifyIntent } from "./agents/intent-classifier.js";
import { runMorningRoutine } from "./morning-routine-service.js";
import { buildStatusOutput } from "./status-service.js";
import { withAgentActivity, completeMessagingTurn } from "./messaging-service.js";
import { maybeAutoCaptureFacts } from "./command-router.js";
import { handleWeatherTurn, shouldHandleWeatherTurn } from "./weather-service.js";
import { handleLiveLookupTurn, shouldHandleLiveLookupTurn } from "./live-lookup-service.js";
import { wireOrchestratorServices } from "./orchestrator-wiring.js";
import { pollFeedWatch } from "./feed-watch-service.js";
import type { HindranceCoordinator } from "./hindrance-coordinator.js";
import type { NotificationCenter } from "@hermes-os/notification-center";

export class Orchestrator {
  private readonly wired: ReturnType<typeof wireOrchestratorServices>;

  constructor(
    private readonly broker: ApprovalBroker,
    private readonly executor: ToolExecutor,
    private readonly audit: AuditLogger,
    private readonly activity: ActivityMonitor,
    private readonly auditRepo: AuditRepository,
    private readonly stateRepo: AssistantStateRepository,
    private readonly workspaceRoot: string,
    private readonly memoryService: MemoryService,
    private readonly skillRunner: SkillRunner,
    private readonly skills: SkillRegistry,
    private readonly hindrance: HindranceCoordinator,
  ) {
    this.wired = wireOrchestratorServices({
      broker,
      executor,
      audit,
      activity,
      hindrance: { shouldSkipBackgroundTask: () => false } as never,
      auditRepo,
      stateRepo,
      memoryService,
      workspaceRoot,
      runMorningBrief: () => this.runMorningBrief(),
      runEveningReview: () => this.runEveningReview(),
      getActivityLog: (n) => this.getActivityLog(n),
      buildStatus: () => this.buildStatus(),
    });
  }

  async runMorningBrief(userMessage = ""): Promise<string> {
    const ctx: ToolContext = {
      actor: "scheduler",
      workspaceRoot: this.workspaceRoot,
      channel: "cli",
    };
    return withAgentActivity(this.activity, "HermesSystem", "morning_brief", userMessage, () =>
      runMorningRoutine(ctx, {
        executor: this.executor,
        workspaceRoot: this.workspaceRoot,
      }),
    );
  }

  async runEveningReview(_userMessage = ""): Promise<string> {
    return "Evening review is not configured in v2 yet.";
  }

  async getActivityLog(limit = 40): Promise<string> {
    return getActivityReport(this.auditRepo, limit);
  }

  async buildStatus(): Promise<string> {
    return buildStatusOutput({
      broker: this.broker,
      memoryService: this.memoryService,
      stateRepo: this.stateRepo,
    });
  }

  async isProactivePaused(): Promise<boolean> {
    return this.hindrance.shouldSkipBackgroundTask();
  }

  async runPresenceScan(_ctx: ToolContext): Promise<string | null> {
    return null;
  }

  async runFeedWatchTick(ctx: ToolContext, notificationCenter?: NotificationCenter | null): Promise<string | null> {
    return pollFeedWatch(
      {
        workspaceRoot: this.workspaceRoot,
        executor: this.executor,
        audit: this.audit,
        notificationCenter: notificationCenter ?? null,
      },
      ctx,
    );
  }

  async handleFeedWebhook(
    body: { feedId?: string; reason?: string },
    ctx: ToolContext,
    notificationCenter?: NotificationCenter | null,
  ): Promise<{ ok: boolean; message: string }> {
    const message = await pollFeedWatch(
      {
        workspaceRoot: this.workspaceRoot,
        executor: this.executor,
        audit: this.audit,
        notificationCenter: notificationCenter ?? null,
      },
      ctx,
      { feedId: body.feedId, forceNotify: true },
    );
    return {
      ok: true,
      message: message ?? "Feed watch completed — no alert.",
    };
  }

  async handleMessage(message: InboundMessage, options?: HandleMessageOptions): Promise<string> {
    throwIfAborted(options?.signal);

    await this.audit.log({
      eventType: "incoming_message",
      actor: message.senderId,
      payload: { channel: message.channel, text: redactSecretsFromText(message.text).slice(0, 500) },
    });

    const ctx: ToolContext = {
      actor: message.senderId,
      workspaceRoot: this.workspaceRoot,
      channel: message.channel,
      conversationHistory:
        options?.conversationHistory ??
        this.wired.conversations.getHistory(message.channel, message.senderId),
    };

    const command = await this.wired.commandRouter.tryHandle(message, ctx);
    if (command?.kind === "password_refused") {
      return completeMessagingTurn(
        { audit: this.audit, conversations: this.wired.conversations },
        message,
        this.wired.commandRouter.passwordRefusalText(),
        options,
      );
    }
    if (command?.kind === "reply") {
      return completeMessagingTurn(
        { audit: this.audit, conversations: this.wired.conversations },
        message,
        command.text,
        options,
      );
    }

    await maybeAutoCaptureFacts(
      { memoryService: this.memoryService, auditRepo: this.auditRepo },
      message.text,
      message.senderId,
    );

    const memCtx: InjectedContext = await injectMemoryContext(message.text, { limit: 6 });

    if (shouldHandleWeatherTurn(message.text, ctx.conversationHistory)) {
      const weatherReply = await withAgentActivity(
        this.activity,
        "HermesSystem",
        "weather",
        message.text.slice(0, 120),
        () => handleWeatherTurn(message.text, ctx, this.executor, memCtx),
      );
      return completeMessagingTurn(
        { audit: this.audit, conversations: this.wired.conversations },
        message,
        weatherReply,
        options,
      );
    }

    if (shouldHandleLiveLookupTurn(message.text, ctx.conversationHistory)) {
      const lookupReply = await withAgentActivity(
        this.activity,
        "ResearchAgent",
        "live_lookup",
        message.text.slice(0, 120),
        () =>
          handleLiveLookupTurn(message.text, {
            memoryService: this.memoryService,
            workspaceRoot: this.workspaceRoot,
          }, ctx.conversationHistory),
      );
      return completeMessagingTurn(
        { audit: this.audit, conversations: this.wired.conversations },
        message,
        lookupReply,
        options,
      );
    }

    const [intent, skillMatches] = await Promise.all([
      classifyIntent(message.text, {
        conversationHistory: ctx.conversationHistory,
        memoryContext: memCtx.systemBlock,
      }),
      matchSkills(message.text, this.skills.listActive()),
    ]);

    const skillThreshold = Number(process.env.SKILL_MATCH_THRESHOLD ?? 0.72);
    const topSkill = skillMatches;
    if (topSkill && topSkill.score >= skillThreshold) {
      const skillResult = await this.skillRunner.run(topSkill.skill.name, ctx);
      const response = skillResult.success
        ? formatSkillResult(skillResult)
        : (skillResult.error ?? "Skill failed.");
      return completeMessagingTurn(
        { audit: this.audit, conversations: this.wired.conversations },
        message,
        response,
        options,
      );
    }

    const result = await this.wired.taskRunner.run(message, ctx, intent, memCtx, options);

    if (result.memoryCandidates?.length) {
      await captureMemoryCandidates(result.memoryCandidates);
    }

    return completeMessagingTurn(
      { audit: this.audit, conversations: this.wired.conversations },
      message,
      result.response,
      options,
    );
  }
}

function formatSkillResult(result: SkillRunResult): string {
  const last = result.steps.at(-1);
  if (last?.data && typeof last.data === "object") {
    const data = last.data as { message?: string; summary?: string };
    if (data.message) return data.message;
    if (data.summary) return data.summary;
  }
  return `Completed skill ${result.skillName}.`;
}
