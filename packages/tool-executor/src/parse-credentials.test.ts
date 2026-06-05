import { describe, expect, it } from "vitest";
import { parseCredentials, looksLikeCredentialReply } from "./parse-credentials.js";

describe("parseCredentials", () => {
  it("parses labeled username and password", () => {
    const creds = parseCredentials("username: me@test.com\npassword: secret");
    expect(creds).toEqual({ username: "me@test.com", password: "secret" });
  });

  it("parses slash-separated pair", () => {
    expect(parseCredentials("me@test.com / secret")).toEqual({
      username: "me@test.com",
      password: "secret",
    });
  });

  it("detects credential-shaped replies", () => {
    expect(looksLikeCredentialReply("username: a password: b")).toBe(true);
  });
});
