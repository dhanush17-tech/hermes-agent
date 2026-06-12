import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fetchArcPageValidated } from "./arc-tab-guard.js";
import { peekBrowserStuck } from "./browser-stuck-guard.js";
import { arcBrowserSearch } from "./arc-browser-search.js";
import { gmailInboxUrl } from "./gmail-browser-url.js";

const execFileAsync = promisify(execFile);

export type ArcInboxThread = {
  from: string;
  subject: string;
  snippet?: string;
};

export type ArcInboxResult = {
  email: string;
  loggedIn: boolean;
  threads: ArcInboxThread[];
  openLoops: Array<{ description: string }>;
  inboxSummary?: string;
  reason?: string;
};

/** Arc browser fallback — opens/focuses Gmail in Arc, reads visible inbox state. */
export class ArcDriver {
  async openUrl(url: string): Promise<void> {
    const { openTabInHermesWindow } = await import("./arc-workspace.js");
    await openTabInHermesWindow(url);
  }

  async focus(): Promise<void> {
    /* Intentionally no-op — avoid stealing focus from the user's workflow. */
  }

  async detectGmailAccount(_expectedEmail: string): Promise<boolean> {
    const focused = await arcBrowserSearch.getActiveTabUrl();
    return focused?.includes("mail.google.com") ?? false;
  }

  async browserCheckInbox(email: string, query?: string): Promise<ArcInboxResult> {
    const [result] = await this.browserCheckAllInboxes([email], query);
    return (
      result ?? {
        email,
        loggedIn: false,
        threads: [],
        openLoops: [],
        reason: "browser_login_required",
      }
    );
  }

  /** One Gmail tab — switch accounts via authuser, no repeated open location loops. */
  async browserCheckAllInboxes(emails: string[], query?: string): Promise<ArcInboxResult[]> {
    const results: ArcInboxResult[] = [];
    let gmailSessionActive = false;

    for (const email of emails) {
      const stuckKey = `gmail:${email}`;
      const prior = peekBrowserStuck(stuckKey);
      if (prior?.stuck) {
        results.push({
          email,
          loggedIn: false,
          threads: [],
          openLoops: [],
          reason: "stuck_loop",
          inboxSummary: prior.healAction,
        });
        continue;
      }

      const url = gmailInboxUrl(email, query);
      const fetched = await fetchArcPageValidated(url, "gmail", {
        stuckKey,
        gmailSessionActive,
      });

      if (fetched.valid) {
        gmailSessionActive = true;
        results.push({
          email,
          loggedIn: true,
          threads: this.parseVisibleThreads(fetched.text),
          openLoops: [],
          inboxSummary: fetched.text.slice(0, 8000),
        });
        continue;
      }

      gmailSessionActive = gmailSessionActive || isGmailHostFromResult(fetched);
      const reason =
        fetched.reason === "gmail_login_required" || fetched.reason === "stuck_loop"
          ? fetched.reason === "stuck_loop"
            ? "stuck_loop"
            : "browser_login_required"
          : fetched.reason ?? "browser_login_required";

      results.push({
        email,
        loggedIn: false,
        threads: [],
        openLoops: [],
        reason,
        inboxSummary: fetched.suggestion,
      });
    }

    return results;
  }

  private parseVisibleThreads(pageText: string): ArcInboxThread[] {
    return pageText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 8 && !/^(inbox|compose|primary|promotions|social)$/i.test(line))
      .slice(0, 12)
      .map((line) => {
        const parts = line.split(/\s+[—–-]\s+/);
        if (parts.length >= 2) {
          return { from: parts[0]!, subject: parts.slice(1).join(" — ") };
        }
        return { from: "Unknown", subject: line };
      });
  }
}

function isGmailHostFromResult(fetched: { url: string }): boolean {
  return fetched.url.includes("mail.google.com");
}

export const arcDriver = new ArcDriver();
