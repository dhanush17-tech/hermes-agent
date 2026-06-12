import { z } from "zod";
import { resolveGmailAccess } from "@hermes-os/connectors";
import type { ToolResult } from "@hermes-os/shared";
import {
  arcDriver,
  getBrowserSessionManager,
  gmailInboxUrl,
  looksLikeGmailLoginExtract,
} from "@hermes-os/browser-control";

const GMAIL_INBOX_EXTRACT_INSTRUCTION = [
  "Read the Gmail inbox visible on this page.",
  "For each email thread list: sender, subject, and time label if shown.",
  "If this is a Google sign-in page, account chooser, or says Sign in, respond with exactly: LOGIN_REQUIRED",
].join(" ");

async function playwrightGmailCheckInbox(email: string, query?: string): Promise<ToolResult> {
  const manager = getBrowserSessionManager();
  const url = gmailInboxUrl(email, query);

  let pageId = manager.activePage;
  const active = pageId ? manager.getPage(pageId) : null;
  if (!pageId || !active?.url?.includes("mail.google.com")) {
    const page = await manager.openPage(url);
    pageId = page.id;
    if (process.env.VITEST !== "true") {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  const text = await manager.extract(pageId!, GMAIL_INBOX_EXTRACT_INSTRUCTION);
  if (looksLikeGmailLoginExtract(text)) {
    return { status: "denied", reason: "browser_login_required" };
  }

  return {
    status: "success",
    data: {
      email,
      loggedIn: true,
      threads: [],
      inboxSummary: text,
      openLoops: [],
    },
  };
}

export const gmailResolveAccessSchema = z.object({
  email: z.string().email().optional(),
  text: z.string().optional(),
  preferredBrowser: z.enum(["arc", "playwright"]).optional(),
});

export async function executeGmailResolveAccess(payload: unknown): Promise<ToolResult> {
  const body = gmailResolveAccessSchema.parse(payload);
  const resolution = await resolveGmailAccess({
    email: body.email,
    text: body.text,
    preferredBrowser: body.preferredBrowser,
    checkBrowserSession: async (email, browser) => {
      if (browser === "arc") return arcDriver.detectGmailAccount(email);
      return false;
    },
  });
  return { status: "success", data: resolution };
}

export const gmailBrowserCheckInboxSchema = z.object({
  email: z.string().email(),
  query: z.string().optional(),
  browser: z.enum(["arc", "playwright"]).optional(),
});

export const gmailBrowserCheckAllInboxesSchema = z.object({
  emails: z.array(z.string().email()).min(1),
  query: z.string().optional(),
  browser: z.enum(["arc", "playwright"]).optional(),
});

export async function executeGmailBrowserCheckInbox(payload: unknown): Promise<ToolResult> {
  const body = gmailBrowserCheckInboxSchema.parse(payload);
  const browser = body.browser ?? "arc";

  if (browser === "arc") {
    const result = await arcDriver.browserCheckInbox(body.email, body.query);
    if (!result.loggedIn) {
      return { status: "denied", reason: result.reason ?? "browser_login_required" };
    }
    return { status: "success", data: { ...result, loggedIn: true } };
  }

  return playwrightGmailCheckInbox(body.email, body.query);
}

export async function executeGmailBrowserCheckAllInboxes(payload: unknown): Promise<ToolResult> {
  const body = gmailBrowserCheckAllInboxesSchema.parse(payload);
  const browser = body.browser ?? "arc";

  if (browser !== "arc") {
    return { status: "denied", reason: "batch_inbox_requires_arc" };
  }

  const results = await arcDriver.browserCheckAllInboxes(body.emails, body.query);
  const ok = results.filter((r) => r.loggedIn);
  const failed = results.filter((r) => !r.loggedIn);

  return {
    status: "success",
    data: {
      inboxes: results,
      read: ok.length,
      failed: failed.length,
    },
  };
}
