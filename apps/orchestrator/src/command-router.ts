import type { InboundMessage, ToolContext } from "@hermes-os/shared";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";
import type { AuditRepository } from "@hermes-os/context-graph";
import { looksLikePasswordInChat, refusePasswordFromChatReply } from "@hermes-os/credentials";
import type { ApprovalAgent } from "./approval-agent.js";
import { parseApprovalCommand, parsedApprovalToEntities } from "./approval-command-parser.js";
import { ConversationSessionStore } from "./conversation-sessions.js";

export type CommandRouterDeps = {
  broker: ApprovalBroker;
  stateRepo: AssistantStateRepository;
  memoryService: MemoryService;
  auditRepo: AuditRepository;
  workspaceRoot: string;
  conversations: ConversationSessionStore;
  runMorningBrief: () => Promise<string>;
  runEveningReview: () => Promise<string>;
  getActivityLog: (limit: number) => Promise<string>;
  buildStatus: () => Promise<string>;
  approvalAgent: ApprovalAgent;
};

export class CommandRouter {
  constructor(private readonly deps: CommandRouterDeps) {}

  async tryHandle(
    message: InboundMessage,
    ctx: ToolContext,
  ): Promise<{ kind: "reply"; text: string } | { kind: "password_refused" } | null> {
    if (looksLikePasswordInChat(message.text)) {
      return { kind: "password_refused" };
    }

    const state = await this.deps.stateRepo.getState();
    if (state === "paused") {
      return { kind: "reply", text: "Assistant is paused. Ask to resume when ready." };
    }
    if (state === "emergency_stop") {
      return { kind: "reply", text: "Emergency stop active. Restart orchestrator process to reset." };
    }

    if (/^(?:\/new|new chat|clear chat)$/i.test(message.text.trim())) {
      this.deps.conversations.clear(message.channel, message.senderId);
      return { kind: "reply", text: "Fresh thread — what's up?" };
    }

    const approval = parseApprovalCommand(message.text);
    if (approval) {
      let resolved = approval;
      if (approval.approvalId === "__latest__") {
        const pending = await this.deps.broker.getPendingApprovals();
        if (pending.length === 0) {
          return null;
        }
        if (pending.length > 1) {
          return {
            kind: "reply",
            text: [
              "Multiple approvals pending — pick one:",
              ...pending.map(
                (p) => `- ${p.id} · ${p.actionType} · ${p.summary.slice(0, 60)}`,
              ),
              "",
              "Reply: approve <id>",
            ].join("\n"),
          };
        }
        resolved = { ...approval, approvalId: pending[0]!.id };
      }
      const result = await this.deps.approvalAgent.handleIntent(
        parsedApprovalToEntities(resolved),
        ctx,
      );
      return { kind: "reply", text: result.reply };
    }

    const direct = await this.tryDirectCommand(message.text);
    if (direct) return { kind: "reply", text: direct };

    return null;
  }

  passwordRefusalText(): string {
    return refusePasswordFromChatReply();
  }

  private async tryDirectCommand(text: string): Promise<string | null> {
    const t = text.trim();
    if (/^daily\s+brief$/i.test(t) || /^morning\s+brief$/i.test(t)) {
      return this.deps.runMorningBrief();
    }
    if (/^evening\s+review$/i.test(t)) {
      return this.deps.runEveningReview();
    }
    if (/^(activity|logs|monitor)(\s+\d+)?$/i.test(t)) {
      const n = Number(t.match(/\d+/)?.[0] ?? 40);
      return this.deps.getActivityLog(n);
    }
    if (/^show\s+approvals$/i.test(t)) {
      const pending = await this.deps.broker.getPendingApprovals();
      if (pending.length === 0) {
        return [
          "No pending approvals.",
          "",
          "Gmail/browser login does NOT need approve <id> — reply **go ahead** to open Arc, sign in manually, then **done**.",
        ].join("\n");
      }
      return [
        "Pending approvals:",
        ...pending.map(
          (p) => `- ${p.id} · ${p.actionType} · risk ${p.riskLevel} · expires ${p.expiresAt}`,
        ),
        "",
        "Reply: approve <id>  (or just **go ahead** if only one is pending)",
        "Deny: deny <id>",
      ].join("\n");
    }
    if (/^login\s+help$/i.test(t)) {
      return [
        "Browser login (Gmail, Canvas, etc.) — no formal approval card needed.",
        "",
        "1. Hermes opens Arc to the site",
        "2. You sign in manually in that window (never paste passwords in chat)",
        "3. Reply **done** or **continue inbox** when logged in",
        "",
        "Shortcut replies: **go ahead** · **done** · **continue inbox**",
        "Check pending tool approvals: **show approvals**",
      ].join("\n");
    }
    if (/^status$/i.test(t)) {
      return this.deps.buildStatus();
    }
    if (/^(pause|resume|emergency\s+stop)$/i.test(t)) {
      if (/^pause$/i.test(t)) {
        await this.deps.stateRepo.setState("paused");
        return "Paused.";
      }
      if (/^resume$/i.test(t)) {
        await this.deps.stateRepo.setState("running");
        return "Resumed.";
      }
      await this.deps.stateRepo.setState("emergency_stop");
      return "Emergency stop engaged. All actions halted.";
    }
    return null;
  }
}

export async function storeAutoFact(
  memoryService: MemoryService,
  content: string,
  memoryType: string,
  senderId: string,
  evidence: string,
): Promise<void> {
  try {
    await memoryService.remember({ content, memoryType, source: senderId, evidence });
  } catch {
    /* non-fatal */
  }
}

export async function maybeAutoCaptureFacts(
  deps: {
    memoryService: MemoryService;
    auditRepo: AuditRepository;
  },
  text: string,
  senderId: string,
): Promise<void> {
  if (/\b(remember|forget|memory)\b/i.test(text)) return;
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;

  const locationMatch = trimmed.match(
    /\b(?:i(?:'m| am) (?:from|in)|i live in|located in|my (?:home|city|address) is)\s+(.+)/i,
  );
  if (locationMatch?.[1]) {
    await storeAutoFact(
      deps.memoryService,
      `User lives in ${locationMatch[1].trim().replace(/[.!?]+$/, "")}`,
      "durable_facts",
      senderId,
      "auto-captured location",
    );
  }
}
