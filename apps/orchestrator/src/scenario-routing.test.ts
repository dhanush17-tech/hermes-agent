import { describe, expect, it } from "vitest";
import { matchWorkflow } from "@hermes-os/workflows";
import { looksLikePasswordInChat } from "@hermes-os/credentials";
import { wantsBrowserGmail, isGmailCheckIntent } from "@hermes-os/connectors";
import { wantsBrowserControlledService } from "./routing-helpers.js";

describe("user scenario routing", () => {
  it("1 — check people@devlabs.com emails → gmail workflow", () => {
    const m = matchWorkflow("check people@devlabs.com emails");
    expect(m?.workflowId).toBe("gmail.check_inbox_with_fallback");
    expect(wantsBrowserControlledService("check people@devlabs.com emails")).toBe(false);
  });

  it("2 — log on and check emails → gmail workflow not laptop", () => {
    const m = matchWorkflow("go log on to people@devlabs.com and check my emails");
    expect(m?.workflowId).toBe("gmail.check_inbox_with_fallback");
    expect(wantsBrowserControlledService("go log on to people@devlabs.com and check my emails")).toBe(false);
  });

  it("3 — open Gmail in Arc → explicit browser, not workflow", () => {
    expect(matchWorkflow("open Gmail in Arc")).toBeNull();
    expect(wantsBrowserGmail("open Gmail in Arc")).toBe(true);
    expect(isGmailCheckIntent("open Gmail in Arc")).toBe(false);
  });

  it("4 — password in chat is detected", () => {
    expect(looksLikePasswordInChat("my password is hunter2")).toBe(true);
  });

  it("5 — send draft reply → send workflow", () => {
    const m = matchWorkflow("send the draft reply");
    expect(m?.workflowId).toBe("gmail.send_draft");
  });

  it("6 — fill form without submit → form workflow", () => {
    const m = matchWorkflow("fill this form but don't submit");
    expect(m?.workflowId).toBe("browser.fill_form_without_submit");
  });

  it("7 — submit form → submit workflow", () => {
    const m = matchWorkflow("submit the form");
    expect(m?.workflowId).toBe("browser.submit_form");
  });

  it("8 — fix repo bug → code workflow", () => {
    const m = matchWorkflow("fix this repo bug");
    expect(m?.workflowId).toBe("code.propose_and_test_patch");
  });

  it("9 — what could go wrong is a direct command pattern", () => {
    expect(/^what\s+could\s+go\s+wrong\s+today\??$/i.test("what could go wrong today?")).toBe(true);
  });

  it("10 — status is a direct command pattern", () => {
    expect(/^status$/i.test("status")).toBe(true);
  });
});
