import { describe, expect, it } from "vitest";
import { messageRelatesToPendingLogin } from "./login-session-utils.js";
import type { PendingLoginSession } from "./login-session-store.js";

const session: PendingLoginSession = {
  id: "login_test",
  service: "slack",
  browser: "arc",
  url: "https://slack.com/signin",
  originalText: "Open Slack",
  createdAt: new Date().toISOString(),
};

describe("messageRelatesToPendingLogin", () => {
  it("relates login steering messages", () => {
    expect(messageRelatesToPendingLogin("go ahead open slack", session)).toBe(true);
    expect(messageRelatesToPendingLogin("done", session)).toBe(true);
  });

  it("does not hijack unrelated desktop tasks", () => {
    expect(messageRelatesToPendingLogin("Open Terminal and run ls ~/Desktop", session)).toBe(false);
    expect(messageRelatesToPendingLogin("What's on my screen right now?", session)).toBe(false);
  });
});
