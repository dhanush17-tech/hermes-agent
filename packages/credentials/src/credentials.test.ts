import { describe, expect, it } from "vitest";
import {
  globalCredentialVault,
  looksLikePasswordInChat,
  payloadContainsRawSecret,
  refusePasswordFromChatReply,
  redactSecretsFromText,
} from "@hermes-os/credentials";

describe("credential vault", () => {
  it("stores and consumes password once", () => {
    const ref = globalCredentialVault.store("gmail", "people@devlabs.com", "hunter2");
    const value = globalCredentialVault.consume(ref, "people@devlabs.com");
    expect(value).toBe("hunter2");
    expect(globalCredentialVault.consume(ref, "people@devlabs.com")).toBeNull();
  });

  it("rejects wrong account", () => {
    const ref = globalCredentialVault.store("gmail", "a@x.com", "secret");
    expect(globalCredentialVault.consume(ref, "b@x.com")).toBeNull();
  });
});

describe("secret redaction", () => {
  it("detects password in chat", () => {
    expect(looksLikePasswordInChat("password is hunter2")).toBe(true);
    expect(looksLikePasswordInChat("my password is hunter2")).toBe(true);
    expect(looksLikePasswordInChat("check my inbox")).toBe(false);
  });

  it("redacts password patterns", () => {
    expect(redactSecretsFromText("password is hunter2")).toContain("[REDACTED]");
  });

  it("rejects raw secret in tool payload", () => {
    expect(payloadContainsRawSecret({ password: "x" })).toBe(true);
    expect(payloadContainsRawSecret({ passwordRef: "pwd_abc" })).toBe(false);
  });

  it("returns refusal message", () => {
    expect(refusePasswordFromChatReply()).toContain("can't use passwords");
  });
});
