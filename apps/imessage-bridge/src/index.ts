#!/usr/bin/env node
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { findWorkspaceRoot } from "@hermes-os/shared";
import { bootstrapPersonalOs } from "@hermes-os/orchestrator/system";
import { IMessageBridge } from "./bridge.js";

const root = findWorkspaceRoot();
try {
  loadEnvFile(resolve(root, ".env"));
} catch {
  /* optional */
}

const sys = bootstrapPersonalOs({ workspaceRoot: root });

console.log("iMessage bridge started (or run full stack: pnpm start / hermes start)");
if (process.env.HERMES_ACTIVITY_CONSOLE === "1") {
  console.log("Activity console logging enabled (HERMES_ACTIVITY_CONSOLE=1).");
}
console.log(`Activity JSONL: ${root}/data/activity.jsonl`);

const bridge = new IMessageBridge(sys.orchestrator);

await bridge.runLoop();
