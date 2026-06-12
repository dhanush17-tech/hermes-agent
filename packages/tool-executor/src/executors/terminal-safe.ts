import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve, relative, isAbsolute } from "node:path";
import type { ToolResult } from "@hermes-os/shared";

const execFileAsync = promisify(execFile);

const SAFE_COMMANDS = [
  /^pwd$/,
  /^ls(\s|$)/,
  /^cat\s+/,
  /^grep\s+/,
  /^rg\s+/,
  /^sed\s+-n\s+/,
  /^git\s+status$/,
  /^git\s+diff(\s|$)/,
  /^git\s+log(\s|$)/,
  /^pnpm\s+test$/,
  /^pnpm\s+build$/,
  /^node\s+scripts\/test-all\.mjs$/,
];

export const terminalProposeCommandSchema = z.object({
  command: z.string().min(1),
  reason: z.string().optional(),
});

export async function executeTerminalProposeCommand(payload: unknown): Promise<ToolResult> {
  const body = terminalProposeCommandSchema.parse(payload);
  return {
    status: "success",
    data: {
      proposal: body.command,
      reason: body.reason ?? "Proposed command — requires terminal.run_safe or approval",
      safe: SAFE_COMMANDS.some((re) => re.test(body.command.trim())),
    },
  };
}

export const terminalRunSafeSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

export async function executeTerminalRunSafe(payload: unknown, root: string): Promise<ToolResult> {
  const body = terminalRunSafeSchema.parse(payload);
  const cmd = body.command.trim();
  if (!SAFE_COMMANDS.some((re) => re.test(cmd))) {
    return { status: "denied", reason: "Command not in terminal.run_safe allowlist" };
  }
  const cwd = body.cwd ? resolveSafeCwd(body.cwd, root) : root;
  if (!cwd) return { status: "denied", reason: "cwd outside workspace" };
  const { stdout, stderr } = await execFileAsync("sh", ["-c", cmd], {
    cwd,
    timeout: 60_000,
    maxBuffer: 512 * 1024,
  });
  return { status: "success", data: { stdout, stderr } };
}

export const terminalRunAfterApprovalSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
});

export async function executeTerminalRunAfterApproval(
  payload: unknown,
  root: string,
  approvalId?: string,
): Promise<ToolResult> {
  if (!approvalId) {
    return { status: "denied", reason: "[requiresApproval] Run terminal command" };
  }
  const body = terminalRunAfterApprovalSchema.parse(payload);
  const cwd = body.cwd ? resolveSafeCwd(body.cwd, root) : root;
  if (!cwd) return { status: "denied", reason: "cwd outside workspace" };
  const { stdout, stderr } = await execFileAsync("sh", ["-c", body.command.trim()], {
    cwd,
    timeout: 60_000,
    maxBuffer: 512 * 1024,
  });
  return { status: "success", data: { stdout, stderr, approvalId } };
}

function resolveSafeCwd(p: string, root: string): string | null {
  const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return abs;
}
