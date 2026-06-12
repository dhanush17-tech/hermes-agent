import type { HandleMessageOptions, InboundMessage, ToolContext } from "@hermes-os/shared";
import { throwIfAborted } from "@hermes-os/shared";
import { redactSecrets } from "@hermes-os/shared";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { getActivityReport } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { AuditRepository } from "@hermes-os/context-graph";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { MemoryService } from "@hermes-os/memory";
import { ConversationSessionStore } from "./conversation-sessions.js";
import { runPokeAgent } from "./poke-agent.js";

/**
 * The control plane. It owns conversation history, memory context, and audit;
 * the actual thinking is one poke-agent loop. No intent classifier, no routers,
 * no sub-agents — the model decides what to do with its tools.
 */
export class Orchestrator {
  private readonly conversations = new ConversationSessionStore();

  constructor(
    private readonly broker: ApprovalBroker,
    private readonly executor: ToolExecutor,
    private readonly audit: AuditLogger,
    private readonly activity: ActivityMonitor,
    private readonly auditRepo: AuditRepository,
    private readonly stateRepo: AssistantStateRepository,
    private readonly workspaceRoot: string,
    private readonly memoryService: MemoryService,
  ) {}

  async handleMessage(message: InboundMessage, options?: HandleMessageOptions): Promise<string> {
    throwIfAborted(options?.signal);

    await this.audit.log({
      eventType: "incoming_message",
      actor: message.senderId,
      payload: {
        channel: message.channel,
        text: redactSecrets(message.text).slice(0, 500),
      },
    });

    const history =
      options?.conversationHistory ??
      this.conversations.getHistory(message.channel, message.senderId);

    const ctx: ToolContext = {
      actor: message.senderId,
      workspaceRoot: this.workspaceRoot,
      channel: message.channel,
      conversationHistory: history,
    };

    // A couple of literal commands stay deterministic (cheap + reliable).
    const direct = await this.tryDirectCommand(message.text);
    if (direct !== null) {
      return this.finish(message, direct, options);
    }

    const memoryBlock = await this.safeMemoryBlock(message.text);

    await this.activity.agentStart("PokeAgent", {
      intent: "chat",
      messagePreview: message.text.slice(0, 120),
    });
    let response: string;
    try {
      const result = await runPokeAgent(message.text, ctx, {
        executor: this.executor,
        memoryBlock,
        signal: options?.signal,
      });
      response = result.response;
      await this.activity.agentDone("PokeAgent", { preview: response.slice(0, 200) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.activity.agentDone("PokeAgent", { ok: false, error: msg });
      response = `Something went wrong: ${msg}`;
    }

    return this.finish(message, response, options);
  }

  /** Persist the turn, audit the reply, and return it. */
  private async finish(
    message: InboundMessage,
    response: string,
    options?: HandleMessageOptions,
  ): Promise<string> {
    if (!options?.skipSessionAppend) {
      this.conversations.appendTurn(message.channel, message.senderId, message.text, response);
    }
    await this.audit.log({
      eventType: "outgoing_message",
      actor: "poke",
      payload: { channel: message.channel, text: response.slice(0, 500) },
    });
    return response;
  }

  private async safeMemoryBlock(topic: string): Promise<string> {
    try {
      return await this.memoryService.formatContextForPrompt(topic, 8);
    } catch {
      return "";
    }
  }

  private async tryDirectCommand(text: string): Promise<string | null> {
    const t = text.trim();
    if (/^evening\s+review$/i.test(t)) return this.runEveningReview();
    if (/^(activity|logs|monitor)(\s+\d+)?$/i.test(t)) {
      const n = Number(t.match(/\d+/)?.[0] ?? 40);
      return this.getActivityLog(n);
    }
    if (/^show\s+approvals$/i.test(t)) {
      const pending = await this.broker.getPendingApprovals();
      if (pending.length === 0) return "No pending approvals.";
      return [
        "Pending approvals:",
        ...pending.map((p) => `- ${p.id} · ${p.actionType} · risk ${p.riskLevel}`),
      ].join("\n");
    }
    return null;
  }

  async getActivityLog(limit = 40): Promise<string> {
    return getActivityReport(this.auditRepo, limit);
  }

  async runEveningReview(_userMessage = ""): Promise<string> {
    return this.runProactive(
      "Give me a short evening wind-down: what got done, anything left open for tomorrow, " +
        "and a gentle nudge if I should wrap up for the night.",
    );
  }

  /** Run the agent in a background/proactive context (no user turn to reply to). */
  private async runProactive(instruction: string): Promise<string> {
    const ctx: ToolContext = {
      actor: "scheduler",
      workspaceRoot: this.workspaceRoot,
      channel: "cli",
    };
    try {
      const memoryBlock = await this.safeMemoryBlock(instruction);
      const result = await runPokeAgent(instruction, ctx, {
        executor: this.executor,
        memoryBlock,
        extraSystem:
          "You are running in the background on a schedule. Be brief and only surface what matters.",
      });
      return result.response;
    } catch (err) {
      return `Proactive run failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async runPresenceScan(_ctx: ToolContext): Promise<string | null> {
    return null;
  }

  /** Did the user message us within the last `minutes`? (signals they're awake/active) */
  async hadRecentUserActivity(minutes = 20): Promise<boolean> {
    const sinceIso = new Date(Date.now() - minutes * 60_000).toISOString();
    try {
      const rows = await this.auditRepo.listFiltered({
        eventTypes: ["incoming_message"],
        sinceIso,
        limit: 1,
      });
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /** A short, caring late-night nudge that draws on what we know about the user. */
  async runWellbeingNudge(): Promise<string> {
    return this.runProactive(
      "It's the middle of the night and I'm still up and active. As someone who genuinely " +
        "cares about me, send ONE short, warm message: gently point out the late hour, tie it " +
        "to anything you know about my sleep or tomorrow's calendar, and suggest wrapping up. " +
        "No lecture — just a caring nudge from a friend.",
    );
  }

  async isProactivePaused(): Promise<boolean> {
    void this.stateRepo;
    return false;
  }
}
