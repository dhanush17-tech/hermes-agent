import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type TestRunResult = {
  ok: boolean;
  command: string;
  output: string;
};

export async function runWorkspaceTests(workspaceRoot: string): Promise<TestRunResult> {
  const command = process.env.HERMES_TEST_COMMAND ?? "pnpm test";
  const parts = command.split(/\s+/);
  const bin = parts[0] ?? "pnpm";
  const args = parts.slice(1);

  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: workspaceRoot,
      timeout: 120_000,
      maxBuffer: 2_000_000,
    });
    const output = `${stdout}\n${stderr}`.slice(-8000);
    return { ok: true, command, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const output = `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}`.slice(-8000);
    return { ok: false, command, output };
  }
}
