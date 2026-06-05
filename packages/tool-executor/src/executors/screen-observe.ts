import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolResult } from "@hermes-os/shared";

const execFileAsync = promisify(execFile);

export async function executeScreenObserve(workspaceRoot: string): Promise<ToolResult> {
  if (process.platform !== "darwin") {
    return { status: "denied", reason: "screen.observe requires macOS" };
  }

  try {
    const captureDir = join(workspaceRoot, "data", "screen-captures");
    await mkdir(captureDir, { recursive: true });
    const file = join(captureDir, `screen-${Date.now()}.png`);
    await execFileAsync("screencapture", ["-x", file], { timeout: 15_000 });
    return {
      status: "success",
      data: { capturePath: file, method: "screencapture" },
    };
  } catch (err) {
    return {
      status: "denied",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
