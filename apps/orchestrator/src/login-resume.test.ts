import { describe, expect, it } from "vitest";
import { isLoginResumeMessage, loginResumeInstructions } from "./login-resume.js";

describe("login-resume", () => {
  it("detects go ahead and done", () => {
    expect(isLoginResumeMessage("go ahead")).toBe(true);
    expect(isLoginResumeMessage("yeah Goa head")).toBe(true);
    expect(isLoginResumeMessage("try agan")).toBe(true);
    expect(isLoginResumeMessage("done")).toBe(true);
    expect(isLoginResumeMessage("best moisturizer")).toBe(false);
  });

  it("does not mention approval commands", () => {
    const msg = loginResumeInstructions("dhanush.kalaiselvan@gmail.com", "arc");
    expect(msg).not.toMatch(/approve/i);
    expect(msg).toContain("done");
  });
});
