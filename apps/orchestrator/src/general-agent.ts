import {
  withMessagingPersona,
  isMessagingChannel,
  needsAgentPlanner,
  wantsShoppingOrLinks,
  looksLikeLeakedReasoning,
  sanitizeAssistantReply,
  MESSAGING_RETRY_SYSTEM,
  messagingModelId,
  formatConversationForPrompt,
  toChatApiHistory,
  augmentMessagingFollowUp,
} from "@hermes-os/shared";
import type { CloudflareWorkersAIClient, ToolContext } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { AutonomousAgent } from "./autonomous-agent.js";

export class GeneralAgent {
  constructor(
    private readonly cf: CloudflareWorkersAIClient | null,
    private readonly memory: MemoryService,
    private readonly executor: ToolExecutor | null,
    private readonly registry: ToolRegistry | null,
    private readonly workspaceRoot: string,
    private readonly activity: ActivityMonitor,
  ) {}

  async run(message: string, ctx?: ToolContext): Promise<string> {
    if (!this.cf) {
      return "I need Cloudflare or Hermes configured to respond. See docs/SETUP.md.";
    }

    const memoryBlock = await this.memory.formatContextForPrompt(message, 10);
    const messaging = isMessagingChannel(ctx?.channel);
    const history = ctx?.conversationHistory ?? [];
    const threadBlock = messaging ? formatConversationForPrompt(history) : "";

    if (this.executor && this.registry && ctx && needsAgentPlanner(message)) {
      const agent = new AutonomousAgent(
        this.cf,
        this.executor,
        this.registry,
        this.workspaceRoot,
        this.activity,
      );
      const raw = await agent.run(message, ctx, {
        classification: "unknown",
        hint: [
          threadBlock,
          `User memories:\n${memoryBlock}`,
          messaging ?
            "Reply with ONLY the final short iMessage-style text — no steps or drafts. Continue the conversation thread above."
          : "Use Arc for Gmail/X/LinkedIn. If stuck, ask_user with one clear question.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      });
      return messaging ? sanitizeAssistantReply(raw) : raw;
    }

    const shoppingHint = wantsShoppingOrLinks(message)
      ? "User wants purchase links — include specific https:// Amazon or retailer URLs in your answer."
      : undefined;

    const system = withMessagingPersona(
      [
        messaging ?
          "You are Hermes — the user's personal agent."
        : "You are Hermes Personal OS — a local-first assistant with approval-gated tools.",
        "Use stored preferences; do not re-ask for facts in memory.",
        "Short follow-ups (e.g. \"what kind of feedback?\") refer to the recent conversation — do not change topic.",
        shoppingHint,
        threadBlock,
        memoryBlock,
      ]
        .filter(Boolean)
        .join("\n\n"),
      ctx?.channel,
    );

    if (messaging) {
      return this.messagingChat(message, system, history);
    }

    return this.cf.chat(message, {
      maxTokens: 2048,
      classification: "unknown",
      system,
      history: toChatApiHistory(history),
    });
  }

  /** iMessage / chat — non-reasoning model + retry if model leaks CoT. */
  private async messagingChat(
    message: string,
    system: string,
    history: ToolContext["conversationHistory"],
  ): Promise<string> {
    const model = messagingModelId();
    const apiHistory = toChatApiHistory(history ?? []);
    const userMessage = augmentMessagingFollowUp(message, history ?? []);
    const opts = { model, maxTokens: 200, system, history: apiHistory };

    let reply = await this.cf!.chat(userMessage, opts);
    if (!looksLikeLeakedReasoning(reply) && reply.trim()) return reply;

    reply = await this.cf!.chat(userMessage, {
      ...opts,
      maxTokens: 160,
      system: `${system}\n\n${MESSAGING_RETRY_SYSTEM}`,
    });
    const cleaned = sanitizeAssistantReply(reply);
    if (cleaned) return cleaned;

    return "Got it — can you say a bit more? I lost the thread for a second.";
  }
}
