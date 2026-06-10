import type { HandleMessageOptions, InboundMessage } from "@hermes-os/shared";
import { sanitizeAssistantReply, isMessagingChannel, looksLikeLeakedReasoning } from "@hermes-os/shared";
import type { ActivityMonitor, AgentName } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { ConversationSessionStore } from "./conversation-sessions.js";

export async function withAgentActivity<T>(
  activity: ActivityMonitor,
  agent: AgentName,
  intent: string,
  messagePreview: string,
  fn: () => Promise<T>,
): Promise<T> {
  await activity.agentStart(agent, { intent, messagePreview });
  try {
    const result = await fn();
    const preview = typeof result === "string" ? result.slice(0, 200) : undefined;
    await activity.agentDone(agent, { preview });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await activity.agentDone(agent, { ok: false, error: msg });
    throw err;
  }
}

export async function completeMessagingTurn(
  deps: {
    audit: AuditLogger;
    conversations: ConversationSessionStore;
  },
  message: InboundMessage,
  reply: string,
  options?: HandleMessageOptions,
): Promise<string> {
  const out = formatOutgoingReply(reply, message.channel);
  if (isMessagingChannel(message.channel) && !options?.skipSessionAppend) {
    deps.conversations.appendTurn(message.channel, message.senderId, message.text, out);
  }
  await deps.audit.log({
    eventType: "outgoing_message",
    actor: "assistant",
    payload: { text: out.slice(0, 500) },
  });
  return out;
}

function coerceUserFacingReply(reply: string): string {
  const trimmed = reply.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as { final?: string | null };
    if (typeof parsed.final === "string" && parsed.final.trim()) return parsed.final.trim();
  } catch {
    /* not json */
  }
  return trimmed;
}

function formatOutgoingReply(reply: string, channel: InboundMessage["channel"]): string {
  const userFacing = coerceUserFacingReply(reply);
  if (!isMessagingChannel(channel)) return userFacing;
  const cleaned = sanitizeAssistantReply(userFacing);
  if (cleaned) return cleaned;
  if (looksLikeLeakedReasoning(userFacing)) {
    return "One sec — let me try that again. Can you rephrase?";
  }
  return userFacing;
}
