import { healArcWorkspace, isArcRecoverableError } from "@hermes-os/browser-control";
import type { ToolContext } from "@hermes-os/shared";
import type { AuditLogger } from "@hermes-os/audit-log";

export function isRecoverableAgentFailure(reply: string): boolean {
  const t = reply.trim();
  if (!t) return false;
  if (/^Research failed:/i.test(t) && isArcRecoverableError(t)) return true;
  if (/^Denied:.*osascript/i.test(t)) return true;
  if (/Arc got an error|execution error.*Arc/i.test(t)) return true;
  return false;
}

export async function recoverFromAgentFailure(deps: {
  audit: AuditLogger;
  failedReply: string;
  ctx: ToolContext;
  retryResearch?: () => Promise<string>;
}): Promise<string> {
  if (!isRecoverableAgentFailure(deps.failedReply)) return deps.failedReply;

  await deps.audit.log({
    eventType: "agent_invoked",
    actor: "system",
    payload: {
      kind: "self_heal",
      trigger: deps.failedReply.slice(0, 200),
    },
  });

  await healArcWorkspace();

  if (deps.retryResearch) {
    try {
      const retry = await deps.retryResearch();
      if (!isRecoverableAgentFailure(retry) && !/^Research failed:/i.test(retry.trim())) {
        return retry;
      }
    } catch {
      /* fall through */
    }
  }

  return "Arc had a browser error — I reset the workspace. Try your request again.";
}
