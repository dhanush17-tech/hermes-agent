import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const POLICY_MARKER = "configs/risk-policy.yaml";

/** Walk up from startDir until the monorepo root (configs/risk-policy.yaml) is found. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(resolve(dir, POLICY_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return resolve(startDir);
    }
    dir = parent;
  }
}
