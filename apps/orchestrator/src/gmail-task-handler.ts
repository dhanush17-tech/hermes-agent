import {
  createGmailApiConnectorFromEnv,
  createMultiAccountGmailFromEnv,
  extractGmailAccountHint,
  isGmailCheckIntent,
  loadGoogleAccountsFromEnv,
  resolveAccountByEmail,
  wantsBrowserGmail,
} from "@hermes-os/connectors";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { formatGmailWorkflowReply, runWorkflow } from "./workflow-runner.js";

export { isGmailCheckIntent, wantsBrowserGmail };

/** Connector-first Gmail — uses workflow engine when executor available. */
export async function tryHandleGmailTask(
  text: string,
  executor?: ToolExecutor,
  ctx?: ToolContext,
): Promise<string | null> {
  if (!isGmailCheckIntent(text)) return null;

  const multi = createMultiAccountGmailFromEnv();
  const hint = extractGmailAccountHint(text);
  const accounts = loadGoogleAccountsFromEnv();

  if (multi && accounts.length) {
    const account = hint ? resolveAccountByEmail(accounts, hint) : accounts[0];
    if (!account) {
      return `No Gmail account configured for ${hint}. Set GOOGLE_ACCOUNTS in .env.`;
    }

    if (executor && ctx) {
      const { outputs, failed } = await runWorkflow("gmail.check_inbox", executor, ctx, {
        accountId: account.id,
        query: "newer_than:3d",
      });
      if (!failed) {
        return formatGmailWorkflowReply(outputs, account.email);
      }
    }

    const unread = await multi.getUnread(account.id, 12);
    const loops = await multi.extractOpenLoops(account.id);
    const lines = [
      `Gmail (${account.email}) — ${unread.length} recent unread:`,
      ...unread.slice(0, 8).map((e) => `- ${e.from}: ${e.subject}`),
    ];
    if (loops.length) {
      lines.push("", "Open loops:", ...loops.slice(0, 5).map((l) => `- ${l.description}`));
    }
    return lines.join("\n");
  }

  const legacy = createGmailApiConnectorFromEnv();
  if (legacy) {
    const unread = await legacy.getUnreadImportant();
    return [
      `Gmail — ${unread.length} important unread:`,
      ...unread.slice(0, 8).map((e) => `- ${e.from}: ${e.subject}`),
    ].join("\n");
  }

  return null;
}
