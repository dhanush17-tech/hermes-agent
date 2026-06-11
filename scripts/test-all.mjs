#!/usr/bin/env node
/** Run vitest in packages/apps that define a test script. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dirs = [
  "packages/shared",
  "packages/llm-client",
  "packages/policies",
  "packages/context-graph",
  "packages/connectors",
  "packages/browser-control",
  "packages/tool-executor",
  "apps/orchestrator",
  "apps/imessage-bridge",
];

let failed = false;
for (const rel of dirs) {
  const pkgPath = resolve(root, rel, "package.json");
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (!pkg.scripts?.test) continue;
  console.log(`\n▸ test ${rel}`);
  const r = spawnSync("pnpm", ["exec", "vitest", "run", "--passWithNoTests"], {
    cwd: resolve(root, rel),
    stdio: "inherit",
  });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
