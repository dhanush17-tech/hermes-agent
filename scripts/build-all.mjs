#!/usr/bin/env node
/**
 * Monolithic build: compile internal modules in dependency order, then src/main.ts.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const ORDER = [
  "packages/shared",
  "packages/llm-client",
  "packages/policies",
  "packages/context-graph",
  "packages/audit-log",
  "packages/approval-broker",
  "packages/risk-engine",
  "packages/memory",
  "packages/notification-center",
  "packages/code-tools",
  "packages/browser-control",
  "packages/browser-workbench",
  "packages/connectors",
  "packages/tool-executor",
  "apps/orchestrator",
  "apps/chat-server",
  "apps/imessage-bridge",
  "apps/daemon",
  "src",
];

function run(label, cmd, args, cwd = root) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`build failed: ${label}`);
    process.exit(r.status ?? 1);
  }
}

for (const rel of ORDER) {
  const dir = resolve(root, rel);
  if (!existsSync(dir)) continue;
  const tsconfig = resolve(dir, "tsconfig.json");
  if (!existsSync(tsconfig)) continue;
  console.log(`\n▸ build ${rel}`);
  run(rel, "pnpm", ["exec", "tsc", "-p", tsconfig]);
}

console.log("\n✓ monolith build complete");
