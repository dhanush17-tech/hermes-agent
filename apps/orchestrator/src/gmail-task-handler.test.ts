import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@hermes-os/connectors", () => ({
  createMultiAccountGmailFromEnv: vi.fn(),
  createGmailApiConnectorFromEnv: vi.fn(),
  loadGoogleAccountsFromEnv: vi.fn(),
  extractGmailAccountHint: vi.fn(),
  resolveAccountByEmail: vi.fn(),
  isGmailCheckIntent: (text: string) => /\b(check|email|gmail|inbox)\b/i.test(text),
  wantsBrowserGmail: (text: string) => /\bopen\s+gmail\s+in\s+browser\b/i.test(text),
}));

import {
  createMultiAccountGmailFromEnv,
  loadGoogleAccountsFromEnv,
  resolveAccountByEmail,
} from "@hermes-os/connectors";
import { tryHandleGmailTask } from "./gmail-task-handler.js";

describe("tryHandleGmailTask", () => {
  beforeEach(() => {
    vi.mocked(createMultiAccountGmailFromEnv).mockReset();
    vi.mocked(loadGoogleAccountsFromEnv).mockReset();
    vi.mocked(resolveAccountByEmail).mockReset();
  });

  it("routes configured account to GmailConnector not browser", async () => {
    const getUnread = vi.fn().mockResolvedValue([
      { from: "Alice", subject: "Hello", id: "1", threadId: "t1", snippet: "" },
    ]);
    const extractOpenLoops = vi.fn().mockResolvedValue([]);
    vi.mocked(createMultiAccountGmailFromEnv).mockReturnValue({
      getUnread,
      extractOpenLoops,
    } as never);
    vi.mocked(loadGoogleAccountsFromEnv).mockReturnValue([
      { id: "people-devlabs", email: "people@devlabs.com", tokenPath: "/tmp/token.json" },
    ]);
    vi.mocked(resolveAccountByEmail).mockReturnValue({
      id: "people-devlabs",
      email: "people@devlabs.com",
      tokenPath: "/tmp/token.json",
    });

    const reply = await tryHandleGmailTask("check people@devlabs.com emails");
    expect(reply).toContain("people@devlabs.com");
    expect(getUnread).toHaveBeenCalledWith("people-devlabs", 12);
  });

  it("returns null when no connector configured", async () => {
    vi.mocked(createMultiAccountGmailFromEnv).mockReturnValue(null);
    vi.mocked(loadGoogleAccountsFromEnv).mockReturnValue([]);
    const { createGmailApiConnectorFromEnv } = await import("@hermes-os/connectors");
    vi.mocked(createGmailApiConnectorFromEnv).mockReturnValue(null);

    const reply = await tryHandleGmailTask("check my inbox");
    expect(reply).toBeNull();
  });
});
