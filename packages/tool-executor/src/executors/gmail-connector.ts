import { existsSync } from "node:fs";
import type { ToolResult, ToolContext } from "@hermes-os/shared";
import {
  createMultiAccountGmailFromEnv,
  loadGoogleAccountsFromEnv,
} from "@hermes-os/connectors";

function resolveAccountId(body: { accountId?: string }): string | null {
  if (body.accountId) return body.accountId;
  const accounts = loadGoogleAccountsFromEnv();
  // Prefer the first account that actually has a token on disk, so an
  // unauthorized account configured first doesn't become the silent default.
  const authed = accounts.find((a) => a.tokenPath && existsSync(a.tokenPath));
  return authed?.id ?? accounts[0]?.id ?? null;
}

export async function executeGmailSearch(payload: unknown): Promise<ToolResult> {
  const body = payload as { accountId?: string; query?: string; maxResults?: number };
  const multi = createMultiAccountGmailFromEnv();
  if (!multi) return { status: "denied", reason: "Gmail API not configured" };
  const accountId = resolveAccountId(body);
  if (!accountId) return { status: "denied", reason: "accountId required" };
  try {
    const emails = await multi.search(accountId, body.query ?? "newer_than:3d", body.maxResults ?? 20);
    return { status: "success", data: { accountId, count: emails.length, emails } };
  } catch (err) {
    return { status: "denied", reason: gmailErrorMessage(err) };
  }
}

export async function executeGmailSummarizeThreads(payload: unknown): Promise<ToolResult> {
  const body = payload as { accountId?: string; threadIds?: string[] };
  const multi = createMultiAccountGmailFromEnv();
  if (!multi) return { status: "denied", reason: "Gmail API not configured" };
  const accountId = resolveAccountId(body);
  if (!accountId) return { status: "denied", reason: "accountId required" };
  const threadIds = body.threadIds ?? [];
  try {
    const summary = await multi.summarizeThreads(accountId, threadIds);
    return { status: "success", data: { accountId, summary } };
  } catch (err) {
    return { status: "denied", reason: gmailErrorMessage(err) };
  }
}

export async function executeGmailExtractOpenLoops(payload: unknown): Promise<ToolResult> {
  const body = payload as { accountId?: string; query?: string };
  const multi = createMultiAccountGmailFromEnv();
  if (!multi) return { status: "denied", reason: "Gmail API not configured" };
  const accountId = resolveAccountId(body);
  if (!accountId) return { status: "denied", reason: "accountId required" };
  try {
    const loops = await multi.extractOpenLoops(accountId, body.query ?? "newer_than:3d");
    return { status: "success", data: { accountId, openLoops: loops } };
  } catch (err) {
    return { status: "denied", reason: gmailErrorMessage(err) };
  }
}

export async function executeGmailCheckInbox(payload: unknown): Promise<ToolResult> {
  const body = payload as { accountId?: string; query?: string };
  const multi = createMultiAccountGmailFromEnv();
  if (!multi) {
    return { status: "denied", reason: "Gmail API not configured — set GOOGLE_ACCOUNTS" };
  }
  const accountId = resolveAccountId(body);
  if (!accountId) return { status: "denied", reason: "accountId required" };

  const query = body.query ?? "newer_than:3d";
  try {
    const emails = await multi.search(accountId, query, 20);
    const threadIds = [...new Set(emails.map((e) => e.threadId).filter(Boolean))] as string[];
    const summary = await multi.summarizeThreads(accountId, threadIds);
    const loops = await multi.extractOpenLoops(accountId, query);

    return {
      status: "success",
      data: {
        accountId,
        query,
        count: emails.length,
        emails,
        summary,
        openLoops: loops.slice(0, 10),
      },
    };
  } catch (err) {
    return { status: "denied", reason: gmailErrorMessage(err) };
  }
}

export async function executeGmailSendDraft(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  const body = payload as { accountId?: string; draftId?: string };
  if (!body.draftId) return { status: "denied", reason: "draftId required" };
  if (!ctx.approvalId) {
    return { status: "denied", reason: "[requiresApproval] Send Gmail draft" };
  }
  const multi = createMultiAccountGmailFromEnv();
  if (!multi) return { status: "denied", reason: "Gmail API not configured" };
  const accountId = resolveAccountId(body);
  if (!accountId) return { status: "denied", reason: "accountId required" };
  try {
    const result = await multi.sendDraft(accountId, body.draftId, ctx.approvalId);
    return { status: "success", data: result };
  } catch (err) {
    return { status: "denied", reason: gmailErrorMessage(err) };
  }
}

function gmailErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/No token for/i.test(message)) {
    return `${message}. Gmail API token is missing; use browser control or run Google OAuth setup.`;
  }
  return message;
}
