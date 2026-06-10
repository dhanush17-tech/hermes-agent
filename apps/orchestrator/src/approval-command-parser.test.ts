import { describe, expect, it } from "vitest";
import { parseApprovalCommand, parsedApprovalToEntities } from "./approval-command-parser.js";

describe("parseApprovalCommand", () => {
  it("parses approve with id", () => {
    const parsed = parseApprovalCommand("approve defdca14");
    expect(parsed).toEqual({ approvalAction: "approve", approvalId: "defdca14" });
    expect(parsedApprovalToEntities(parsed!)).toMatchObject({
      approvalAction: "approve",
      approvalId: "defdca14",
    });
  });

  it("parses critical approve", () => {
    const parsed = parseApprovalCommand("approve abc123 execute");
    expect(parsed).toEqual({
      approvalAction: "approve",
      approvalId: "abc123",
      criticalConfirmed: true,
    });
  });

  it("parses deny", () => {
    expect(parseApprovalCommand("deny defdca14")).toEqual({
      approvalAction: "deny",
      approvalId: "defdca14",
    });
  });

  it("parses edit with payload", () => {
    expect(parseApprovalCommand("edit defdca14: people@devlabs.club")).toEqual({
      approvalAction: "edit",
      approvalId: "defdca14",
      editText: "people@devlabs.club",
    });
  });

  it("returns null for non-approval text", () => {
    expect(parseApprovalCommand("check my email")).toBeNull();
  });

  it("maps casual consent to latest approval", () => {
    expect(parseApprovalCommand("go ahead")).toEqual({
      approvalAction: "approve",
      approvalId: "__latest__",
    });
  });
});
