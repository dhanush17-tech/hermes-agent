import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { maybeResumePendingBrowserLogin } from "./browser-control-service.js";

describe("maybeResumePendingBrowserLogin", () => {
  it("reconstructs a Gmail browser retry from pending login state", async () => {
    const root = join(tmpdir(), `hermes-browser-resume-${Date.now()}`);
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(
      join(root, "data", "pending-login.json"),
      JSON.stringify({
        service: "gmail",
        email: "people@devlabs.club",
        browser: "playwright",
        url: "https://mail.google.com/mail/u/0/#inbox",
        originalText: "login to people@devlabs.club on arc",
        createdAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const calls: Array<{ tool: string; payload: unknown }> = [];
    const executor = {
      invoke: async (tool: string, payload: unknown) => {
        calls.push({ tool, payload });
        if (tool === "browser.open") {
          return { status: "success" as const, data: { url: "https://mail.google.com/mail/u/0/#inbox" } };
        }
        throw new Error(`Unexpected tool ${tool}`);
      },
    };

    const reply = await maybeResumePendingBrowserLogin("go ahead", executor as never, {
      actor: "test",
      workspaceRoot: root,
      channel: "cli",
      conversationHistory: [],
    });

    expect(reply).toContain("Opened Gmail");
    expect(reply).toContain("done");
    expect(calls[0]).toMatchObject({
      tool: "browser.open",
      payload: { url: "https://mail.google.com/mail/u/0/#inbox" },
    });

    await rm(root, { recursive: true, force: true });
  });

  it("reads inbox from Playwright session when user replies done", async () => {
    const root = join(tmpdir(), `hermes-browser-done-${Date.now()}`);
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(
      join(root, "data", "pending-login.json"),
      JSON.stringify({
        service: "gmail",
        email: "dhanush.kalaiselvan@gmail.com",
        browser: "playwright",
        url: "https://mail.google.com/mail/u/0/#inbox",
        originalText: "check gmail",
        createdAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const calls: string[] = [];
    const executor = {
      invoke: async (tool: string) => {
        calls.push(tool);
        if (tool === "gmail.browser_check_inbox") {
          return { status: "denied" as const, reason: "browser_login_required" };
        }
        if (tool === "browser.extract") {
          return {
            status: "success" as const,
            data: {
              text: [
                "Read the Gmail inbox visible on this page.",
                "--- page text ---",
                "Inbox",
                "Compose",
                "Alice — Standup notes — 9:12 AM",
                "Bob — PR review — yesterday",
              ].join("\n"),
            },
          };
        }
        throw new Error(`Unexpected tool ${tool}`);
      },
    };

    const reply = await maybeResumePendingBrowserLogin("done", executor as never, {
      actor: "test",
      workspaceRoot: root,
      channel: "cli",
      conversationHistory: [],
    });

    expect(reply).toContain("Gmail inbox for dhanush.kalaiselvan@gmail.com");
    expect(reply).toContain("Standup notes");
    expect(calls).toEqual(["browser.extract"]);
    expect(calls).not.toContain("credential.request_login_assist");

    await rm(root, { recursive: true, force: true });
  });
});
