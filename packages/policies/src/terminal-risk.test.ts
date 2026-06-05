import { describe, expect, it } from "vitest";
import { classifyTerminalCommand, isDestructiveTerminalCommand } from "./terminal-risk.js";

describe("classifyTerminalCommand", () => {
  it("flags rm -rf", () => {
    expect(classifyTerminalCommand("rm -rf /")).toBe("destructive");
  });

  it("flags git push", () => {
    expect(classifyTerminalCommand("git push origin main")).toBe("high");
  });

  it("allows safe commands", () => {
    expect(classifyTerminalCommand("ls -la")).toBe("safe");
    expect(isDestructiveTerminalCommand("ls -la")).toBe(false);
  });
});
