import { describe, expect, it } from "vitest";
import { handleMatchKeys, isApprovedSender, loadApprovedSenders } from "./approved-senders.js";
import { isAutomatedInbound } from "./message-filters.js";

describe("message-filters", () => {
  it("detects OTP and Apple ID SMS", () => {
    expect(isAutomatedInbound("Please find your OTP: 2191", "moh-online(smsft)")).toBe(true);
    expect(
      isAutomatedInbound(
        "Your Apple ID Code is: 010109. Don't share it with anyone.",
        "apple",
      ),
    ).toBe(true);
    expect(
      isAutomatedInbound(
        "Your Apple ID code is: 952856. Do not share it with anyone.",
        "apple(smsft)",
      ),
    ).toBe(true);
  });

  it("allows normal user messages from a phone handle", () => {
    expect(isAutomatedInbound("check my gmail inbox", "+15551234567")).toBe(false);
    expect(isAutomatedInbound("daily brief", "you@icloud.com")).toBe(false);
  });
});

describe("approved-senders", () => {
  it("denies all when allowlist empty", () => {
    const prev = process.env.APPROVED_IMESSAGE_SENDERS;
    const prevDefault = process.env.IMESSAGE_DEFAULT_RECIPIENT;
    delete process.env.APPROVED_IMESSAGE_SENDERS;
    delete process.env.IMESSAGE_DEFAULT_RECIPIENT;
    const approved = loadApprovedSenders();
    expect(isApprovedSender("+15551234567", approved)).toBe(false);
    expect(isApprovedSender("apple", approved)).toBe(false);
    process.env.APPROVED_IMESSAGE_SENDERS = prev;
    process.env.IMESSAGE_DEFAULT_RECIPIENT = prevDefault;
  });

  it("matches normalized handles", () => {
    const approved = new Set(handleMatchKeys("+1 (555) 123-4567"));
    expect(isApprovedSender("+15551234567", approved)).toBe(true);
  });
});
