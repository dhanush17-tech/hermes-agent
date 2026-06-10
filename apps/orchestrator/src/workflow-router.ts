import { matchWorkflow, runWorkflowWithExecutor, formatWorkflowReply, type WorkflowMatch } from "@hermes-os/workflows";
import { extractGmailAccountHint } from "@hermes-os/connectors";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import {
  handleFormFillWithoutSubmit,
  handleFormSubmit,
  handleSendDraftReply,
  handleCodeFixWorkflow,
  requestLoginAssistForGmail,
} from "./browser-control-service.js";

export class WorkflowRouter {
  match(text: string): WorkflowMatch | null {
    return matchWorkflow(text);
  }

  async run(match: WorkflowMatch, executor: ToolExecutor, ctx: ToolContext): Promise<string> {
    switch (match.workflowId) {
      case "gmail.check_inbox_with_fallback":
        return this.runGmailCheckInboxWithFallback(match, executor, ctx);
      case "gmail.send_draft":
        return handleSendDraftReply(String(match.inputs.text ?? ""), executor, ctx);
      case "browser.fill_form_without_submit":
        return handleFormFillWithoutSubmit(String(match.inputs.text ?? ""), executor, ctx);
      case "browser.submit_form":
        return handleFormSubmit(String(match.inputs.text ?? ""), executor, ctx);
      case "code.propose_and_test_patch":
        return handleCodeFixWorkflow(String(match.inputs.text ?? ""), executor, ctx);
      case "daily.morning_brief":
        return "Morning brief is available via `morning brief` command.";
      case "daily.evening_review":
        return "Evening review is available via `evening review` command.";
      default:
        break;
    }

    const { outputs, failed } = await runWorkflowWithExecutor(
      match.workflowId,
      {
        invoke: (tool, payload, toolCtx) =>
          executor.invoke(tool, payload, toolCtx, { summary: `workflow:${match.workflowId}:${tool}` }),
      },
      ctx,
      match.inputs,
    );
    if (failed) return `Workflow ${match.workflowId} failed: ${failed}`;
    return formatWorkflowReply(match.workflowId, outputs);
  }

  private async runGmailCheckInboxWithFallback(
    match: WorkflowMatch,
    executor: ToolExecutor,
    ctx: ToolContext,
  ): Promise<string> {
    const text = String(match.inputs.text ?? "");
    const emailHint = extractGmailAccountHint(text);

    const accessResult = await executor.invoke(
      "gmail.resolve_access",
      { text, email: emailHint ?? undefined },
      ctx,
      { summary: "Resolve Gmail access mode" },
    );
    if (accessResult.status !== "success") {
      return accessResult.status === "pending_approval"
        ? accessResult.message
        : `Could not resolve Gmail access: ${accessResult.reason}`;
    }

    const access = accessResult.data as {
      mode: string;
      accountId?: string;
      email: string;
      preferredBrowser?: string;
      reason?: string;
    };

    if (access.mode === "api" && access.accountId) {
      const result = await executor.invoke(
        "gmail.check_inbox",
        { accountId: access.accountId, query: "newer_than:3d" },
        ctx,
        { summary: "Gmail API inbox check" },
      );
      if (result.status === "success") {
        return formatWorkflowReply("gmail.check_inbox", { inbox: result.data }, {
          email: access.email,
          mode: "api",
        });
      }
    }

    if (access.mode === "browser_logged_in") {
      const result = await executor.invoke(
        "gmail.browser_check_inbox",
        { email: access.email, browser: access.preferredBrowser ?? "arc" },
        ctx,
        { summary: "Gmail browser inbox check" },
      );
      if (result.status === "success") {
        return formatGmailBrowserReply(access, result.data);
      }
    }

    if (access.mode === "oauth_required" || access.mode === "browser_login_required") {
      const browser = access.preferredBrowser ?? "arc";
      const assistMsg = await requestLoginAssistForGmail(access.email, executor, ctx);
      return [
        `Gmail API is not authorized for ${access.email}${browser === "arc" ? ", so I'll use Arc browser cookies." : "."}`,
        access.mode === "browser_login_required"
          ? `${browser === "arc" ? "Arc" : "Playwright"} is not logged into ${access.email} yet.`
          : "OAuth token is missing or expired.",
        assistMsg,
        "",
        "No approve <id> needed for login — reply **go ahead** to open Arc, sign in manually, then **done**.",
        "Type **login help** anytime for these steps.",
      ].join("\n");
    }

    return access.reason ?? "Gmail unavailable.";
  }
}

function formatGmailBrowserReply(
  access: { email: string; preferredBrowser?: string },
  data: unknown,
): string {
  const body = data as {
    threads?: Array<{ from: string; subject: string }>;
    openLoops?: Array<{ description: string }>;
    loggedIn?: boolean;
  };
  const lines = [
    `Gmail API is not authorized for ${access.email}, so I used ${access.preferredBrowser ?? "Arc"} fallback.`,
    body.loggedIn ? `${access.preferredBrowser === "playwright" ? "Playwright" : "Arc"} is already logged in.` : "",
  ].filter(Boolean);
  if (body.threads?.length) {
    lines.push(`Found ${body.threads.length} visible recent threads:`);
    lines.push(...body.threads.slice(0, 8).map((t) => `- ${t.from}: ${t.subject}`));
  }
  if (body.openLoops?.length) {
    lines.push("", "Open loops:", ...body.openLoops.slice(0, 5).map((l) => `- ${l.description}`));
  }
  lines.push("", "Tip: authorize Gmail API for faster inbox checks next time.");
  return lines.join("\n");
}
