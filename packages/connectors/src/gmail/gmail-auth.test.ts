import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isGmailCheckIntent, wantsBrowserGmail } from "./gmail-auth.js";

describe("Gmail intent routing", () => {
  it("detects email check intent", () => {
    expect(isGmailCheckIntent("go log on to people@devlabs.com and check my emails")).toBe(true);
    expect(isGmailCheckIntent("check my gmail inbox")).toBe(true);
  });

  it("does not treat open-in-browser as connector intent", () => {
    expect(wantsBrowserGmail("open Gmail in browser")).toBe(true);
    expect(isGmailCheckIntent("open Gmail in browser")).toBe(false);
    expect(isGmailCheckIntent("open Gmail in Arc browser")).toBe(false);
  });

  it("gmail.send_draft requires approval in risk policy", () => {
    const raw = readFileSync(resolve(process.cwd(), "../../configs/risk-policy.yaml"), "utf8");
    expect(raw).toMatch(/gmail\.send_draft:[\s\S]*?risk:\s*high[\s\S]*?approval:\s*always/);
  });
});
