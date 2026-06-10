import { generateId } from "@hermes-os/shared";
import { extractHttpsLinks } from "@hermes-os/shared";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import {
  arcDriver,
  looksLikeGmailLoginExtract,
  validatePageContent,
  pageTextFromBrowserExtract,
} from "@hermes-os/browser-control";
import { preferredBrowserFromEnv } from "@hermes-os/connectors";
import { LoginSessionStore, type PendingLoginSession } from "./login-session-store.js";

import {
  isLoginResumeMessage,
  LOGIN_RESUME_DONE_RE,
  LOGIN_RESUME_OPEN_RE,
  loginResumeInstructions,
} from "./login-resume.js";

const CONTINUE_BROWSER_LOGIN_RE =
  /\b(try|use|open|continue|resume)\b.*\b(arc|playwright|browser)\b/i;

const GMAIL_INBOX_EXTRACT_INSTRUCTION = [
  "Read the Gmail inbox visible on this page.",
  "For each email thread list: sender, subject, and time label if shown.",
  "If this is a Google sign-in page, account chooser, or says Sign in, respond with exactly: LOGIN_REQUIRED",
  "If the inbox is empty, respond with: INBOX_EMPTY",
].join(" ");

function requestedBrowser(text: string): "arc" | "playwright" {
  return /\bplaywright\b/i.test(text) ? "playwright" : "arc";
}

function formatGmailInboxReply(email: string, text: string, source = "browser"): string {
  return [
    `Gmail inbox for ${email} (via ${source}):`,
    "",
    text.trim().slice(0, 6000),
    "",
    "Read-only — no send/delete/archive actions taken.",
  ].join("\n");
}

function formatGmailBrowserData(
  email: string,
  data: { threads?: Array<{ from: string; subject: string }>; inboxSummary?: string },
  source: string,
): string {
  const summary = data.inboxSummary?.trim();
  if (summary) return formatGmailInboxReply(email, summary, source);
  if (data.threads?.length) {
    const lines = data.threads.slice(0, 12).map((t) => `- **${t.from}**: ${t.subject}`);
    return formatGmailInboxReply(email, lines.join("\n"), source);
  }
  return formatGmailInboxReply(email, "Inbox loaded but no threads were parsed.", source);
}

type InboxReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: "login_required" | "no_page" | "extract_failed"; detail?: string };

/** Read inbox from the Playwright session the user signed into (not Arc AppleScript). */
async function readGmailInboxFromActiveSession(
  executor: ToolExecutor,
  ctx: ToolContext,
  email: string,
  opts?: { url?: string },
): Promise<InboxReadResult> {
  const extractOnce = async (): Promise<InboxReadResult> => {
    const extract = await executor.invoke(
      "browser.extract",
      { instruction: GMAIL_INBOX_EXTRACT_INSTRUCTION },
      ctx,
      { summary: `Extract Gmail inbox for ${email}` },
    );
    if (extract.status === "pending_approval") {
      return { ok: false, reason: "extract_failed", detail: extract.message };
    }
    if (extract.status !== "success") {
      return { ok: false, reason: "extract_failed", detail: extract.reason };
    }
    const text = String((extract.data as { text?: string } | undefined)?.text ?? "");
    if (looksLikeGmailLoginExtract(text)) return { ok: false, reason: "login_required" };
    const pageText = pageTextFromBrowserExtract(text);
    const validation = validatePageContent("gmail", pageText);
    if (!validation.ok) {
      return {
        ok: false,
        reason: "extract_failed",
        detail: validation.suggestion ?? validation.reason,
      };
    }
    return { ok: true, text: pageText };
  };

  let result = await extractOnce();
  if (result.ok || result.reason === "login_required") return result;

  const noPage = /no page/i.test(result.detail ?? "");
  if (!noPage) return result;

  const url = opts?.url ?? "https://mail.google.com/mail/u/0/#inbox";
  const open = await executor.invoke("browser.open", { url }, ctx, { summary: `Open Gmail for ${email}` });
  if (open.status === "pending_approval") {
    return { ok: false, reason: "no_page", detail: open.message };
  }
  if (open.status !== "success") {
    return { ok: false, reason: "no_page", detail: open.reason };
  }

  result = await extractOnce();
  return result;
}

async function readGmailInboxFromArc(
  executor: ToolExecutor,
  ctx: ToolContext,
  email: string,
): Promise<InboxReadResult> {
  const result = await executor.invoke(
    "gmail.browser_check_inbox",
    { email, browser: "arc" },
    ctx,
    { summary: `Read Gmail inbox from Arc for ${email}` },
  );
  if (result.status === "success") {
    const data = result.data as { inboxSummary?: string; threads?: Array<{ from: string; subject: string }> };
    const text = data.inboxSummary?.trim() || data.threads?.map((t) => `${t.from} — ${t.subject}`).join("\n") || "";
    if (text) return { ok: true, text };
    return { ok: false, reason: "extract_failed", detail: "Arc inbox was empty" };
  }
  if (result.status === "denied" && result.reason === "browser_login_required") {
    return { ok: false, reason: "login_required" };
  }
  const detail =
    result.status === "denied" ? result.reason : result.status === "pending_approval" ? result.message : "unknown";
  return { ok: false, reason: "extract_failed", detail };
}

/** Try Arc (where the user usually signs in) then Playwright. */
async function readGmailInboxAfterLogin(
  executor: ToolExecutor,
  ctx: ToolContext,
  email: string,
  opts?: { url?: string; preferArc?: boolean },
): Promise<InboxReadResult & { source?: string }> {
  const tryArc = async () => {
    const arc = await readGmailInboxFromArc(executor, ctx, email);
    return arc.ok ? { ...arc, source: "Arc" } : arc;
  };
  const tryPlaywright = async () => {
    const pw = await readGmailInboxFromActiveSession(executor, ctx, email, opts);
    return pw.ok ? { ...pw, source: "Playwright" } : pw;
  };

  if (opts?.preferArc !== false) {
    const arc = await tryArc();
    if (arc.ok) return arc;
    const pw = await tryPlaywright();
    if (pw.ok) return pw;
    if (arc.reason === "login_required" && pw.reason === "login_required") {
      return { ok: false, reason: "login_required" };
    }
    return pw.reason === "login_required" ? arc : pw;
  }

  const pw = await tryPlaywright();
  if (pw.ok) return { ...pw, source: "Playwright" };
  const arc = await tryArc();
  if (arc.ok) return { ...arc, source: "Arc" };
  return pw.reason === "login_required" || arc.reason === "login_required"
    ? { ok: false, reason: "login_required" }
    : pw;
}

async function savePendingBrowserLogin(
  ctx: ToolContext,
  session: Omit<PendingLoginSession, "id" | "createdAt">,
): Promise<void> {
  const store = new LoginSessionStore(ctx.workspaceRoot);
  await store.save({
    id: generateId("login"),
    createdAt: new Date().toISOString(),
    ...session,
  });
}

async function readPendingBrowserLogin(ctx: ToolContext): Promise<PendingLoginSession | null> {
  const store = new LoginSessionStore(ctx.workspaceRoot);
  return store.get();
}

/** Explicit Arc/browser Gmail — BrowserControl path, not LaptopControlAgent screenshots. */
export async function handleExplicitBrowserGmail(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const pending = await readPendingBrowserLogin(ctx);
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  const email = emailMatch?.[0] ?? pending?.email;
  const browser = /\b(arc|playwright)\b/i.test(text)
    ? requestedBrowser(text)
    : (pending?.browser ?? preferredBrowserFromEnv());

  if (email) {
    const result = await executor.invoke(
      "gmail.browser_check_inbox",
      { email, browser },
      ctx,
      { summary: "Open Gmail in browser and read inbox" },
    );
    if (result.status === "pending_approval") return result.message;
    if (result.status === "success") {
      return formatGmailBrowserData(
        email,
        result.data as { threads?: Array<{ from: string; subject: string }>; inboxSummary?: string },
        browser === "arc" ? "Arc" : "Playwright",
      );
    }
    if (result.reason === "browser_login_required") {
      const fallback = await readGmailInboxAfterLogin(executor, ctx, email, {
        url: pending?.url ?? "https://mail.google.com/mail/u/0/#inbox",
      });
      if (fallback.ok) return formatGmailInboxReply(email, fallback.text, fallback.source ?? "browser");
      return requestLoginAssistForGmail(email, executor, ctx);
    }
    return result.status === "denied" ? `Could not open Gmail: ${result.reason}` : "Gmail browser check failed.";
  }

  const open = await executor.invoke(
    "browser.open",
    { url: "https://mail.google.com/mail/u/0/#inbox" },
    ctx,
    { summary: "Open Gmail in browser" },
  );
  if (open.status === "pending_approval") return open.message;
  if (open.status === "denied") return `Could not open Gmail: ${open.reason}`;

  const observe = await executor.invoke("browser.observe", {}, ctx, { summary: "Observe Gmail page" });
  if (observe.status === "success") {
    return [
      `Opened Gmail in ${browser === "arc" ? "Arc" : "Playwright"}.`,
      "Read-only — no send/delete/archive actions taken.",
      "Use browser.fill with refs from the observation to fill fields if needed.",
    ].join("\n");
  }
  return "Gmail opened. Observation unavailable — check browser profile.";
}

export async function maybeResumePendingBrowserLogin(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string | null> {
  return handlePendingLoginMessage(text, executor, ctx);
}

/** Resume or open browser when user replies to a pending Gmail login pause. */
export async function handlePendingLoginMessage(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string | null> {
  const pending = await readPendingBrowserLogin(ctx);
  if (!pending?.email) return null;

  const wantsContinue =
    isLoginResumeMessage(text) ||
    CONTINUE_BROWSER_LOGIN_RE.test(text) ||
    /\bcontinue inbox\b/i.test(text);

  if (!wantsContinue) return null;

  const browser = pending.browser ?? requestedBrowser(text);

  if (LOGIN_RESUME_DONE_RE.test(text) || /\bcontinue inbox\b/i.test(text)) {
    const store = new LoginSessionStore(ctx.workspaceRoot);
    const read = await readGmailInboxAfterLogin(executor, ctx, pending.email, {
      url: pending.url ?? "https://mail.google.com/mail/u/0/#inbox",
      preferArc: browser !== "playwright",
    });
    if (read.ok) {
      await store.clear();
      return formatGmailInboxReply(pending.email, read.text, read.source ?? "browser");
    }
    if (read.reason === "login_required") {
      return [
        `Could not read Gmail for ${pending.email} from Arc or Playwright.`,
        "Make sure Gmail is open and logged in — usually in your **Arc** tab at mail.google.com.",
        'Reply **go ahead** to focus Arc on Gmail, then **done** once the inbox is visible.',
      ].join("\n");
    }
    return `Could not read inbox: ${read.detail ?? read.reason}. Reply **go ahead** to reopen Gmail, then **done**.`;
  }

  const useArc = browser !== "playwright";
  if (useArc) {
    try {
      await arcDriver.openUrl(pending.url ?? "https://mail.google.com/mail/u/0/#inbox");
      await arcDriver.focus();
    } catch {
      return "Could not open Arc — is it installed and running? Reply with **playwright** to use the built-in browser instead.";
    }
    await savePendingBrowserLogin(ctx, {
      service: pending.service,
      email: pending.email,
      browser: "arc",
      url: pending.url ?? "https://mail.google.com/mail/u/0/#inbox",
      originalText: pending.originalText,
    });
    return [
      `Opened Gmail for ${pending.email} in **Arc**.`,
      "Sign in there if needed — I read from your Arc tab, not a separate window.",
      'When the inbox is visible, reply **done** or **continue inbox**.',
    ].join("\n");
  }

  const open = await executor.invoke(
    "browser.open",
    { url: pending.url ?? "https://mail.google.com/mail/u/0/#inbox" },
    ctx,
    { summary: `Open Gmail for ${pending.email}` },
  );
  if (open.status === "pending_approval") return open.message;
  if (open.status === "denied") return `Could not open Gmail: ${open.reason}`;

  await savePendingBrowserLogin(ctx, {
    service: pending.service,
    email: pending.email,
    browser: "playwright",
    url: pending.url ?? "https://mail.google.com/mail/u/0/#inbox",
    originalText: pending.originalText,
  });

  return [
    `Opened Gmail for ${pending.email} in **Playwright** (a Chromium window — check your dock).`,
    "Sign in manually in that window — I won't take passwords in chat.",
    'When finished, reply **done** or **continue inbox** and I\'ll read your mail.',
  ].join("\n");
}

export async function handleFormFillWithoutSubmit(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const urls = extractHttpsLinks(text);
  const url = urls[0];
  if (!url) {
    return "Share the form URL (https://…) and field values. I will open it, observe refs, and fill without submitting.";
  }

  const open = await executor.invoke("browser.open", { url }, ctx, { summary: "Open form page" });
  if (open.status === "pending_approval") return open.message;
  if (open.status === "denied") return `Could not open form: ${open.reason}`;

  const observe = await executor.invoke("browser.observe", {}, ctx, { summary: "Observe form fields" });
  if (observe.status !== "success") {
    const reason = observe.status === "denied" ? observe.reason : "unknown error";
    return `Opened ${url} but could not observe fields: ${reason}`;
  }

  return [
    `Opened ${url} and observed form fields.`,
    "I will not click Submit without explicit approval.",
    "Reply with field values using browser refs from the observation, or ask me to fill specific fields.",
    JSON.stringify(observe.data).slice(0, 2000),
  ].join("\n\n");
}

export async function handleFormSubmit(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const submit = await executor.invoke(
    "browser.submit",
    { label: "Submit" },
    ctx,
    { summary: "Submit web form" },
  );
  if (submit.status === "pending_approval") return submit.message;
  if (submit.status === "denied") return `Submit denied: ${submit.reason}`;
  return `Form submitted: ${JSON.stringify(submit.data)}`;
}

export async function handleSendDraftReply(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const draftIdMatch = text.match(/\bdraft[_-]?id[:\s]+(\S+)/i);
  const draftId = draftIdMatch?.[1];

  const send = await executor.invoke(
    "gmail.send_draft",
    draftId ? { draftId } : {},
    ctx,
    { summary: "Send Gmail draft" },
  );
  if (send.status === "pending_approval") return send.message;
  if (send.status === "denied") {
    if (/draftId required/i.test(send.reason ?? "")) {
      return "Sending email requires approval. Tell me which draft (draftId) or ask me to list drafts first.";
    }
    return `Send denied: ${send.reason}`;
  }
  return `Draft sent: ${JSON.stringify(send.data)}`;
}

export async function handleCodeFixWorkflow(
  text: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const patch = await executor.invoke(
    "code.propose_patch",
    { instruction: text },
    ctx,
    { summary: "Propose code patch" },
  );
  if (patch.status === "pending_approval") return patch.message;
  if (patch.status === "denied") return `Patch proposal failed: ${patch.reason}`;

  const tests = await executor.invoke("code.run_tests", {}, ctx, { summary: "Run tests after patch proposal" });
  const testNote =
    tests.status === "success"
      ? "Tests passed."
      : tests.status === "denied"
        ? `Tests: ${tests.reason?.slice(0, 300)}`
        : "Tests incomplete.";

  return [
    "Patch proposed (not applied yet).",
    patch.data ? JSON.stringify(patch.data).slice(0, 1500) : "",
    testNote,
    "Use code.apply_patch_after_approval with approval to apply.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function requestLoginAssistForGmail(
  email: string,
  executor: ToolExecutor,
  ctx: ToolContext,
): Promise<string> {
  const browser = preferredBrowserFromEnv();
  await savePendingBrowserLogin(ctx, {
    service: "gmail",
    email,
    browser,
    url: "https://mail.google.com/mail/u/0/#inbox",
    originalText: `gmail login assist for ${email}`,
  });
  const assist = await executor.invoke(
    "credential.request_login_assist",
    { service: "gmail", email, browser },
    ctx,
    { summary: "Secure login assist" },
  );
  if (assist.status === "success") {
    const open = await executor.invoke(
      "browser.open",
      { url: "https://mail.google.com/mail/u/0/#inbox" },
      ctx,
      { summary: `Open Gmail login for ${email}` },
    );
    const opened =
      open.status === "success"
        ? `Opened ${browser === "arc" ? "Arc" : "Playwright"} to Gmail.`
        : open.status === "pending_approval"
          ? open.message
          : `Could not open browser: ${open.reason}`;
    return [loginResumeInstructions(email, browser), "", opened].filter(Boolean).join("\n");
  }
  if (assist.status === "denied") return assist.reason ?? "Login assist failed.";
  return assist.message;
}
