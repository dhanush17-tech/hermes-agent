#!/usr/bin/env node
/**
 * Hermes Personal OS — single entrypoint.
 *
 *   hermes start          default: daemon + chat + scheduler (monolith)
 *   hermes daemon         same as start
 *   hermes chat           chat UI only (no scheduler)
 *   hermes imessage       iMessage bridge only
 */
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { findWorkspaceRoot } from "@hermes-os/shared";
import { startDaemon } from "@hermes-os/daemon";
import { bootstrapPersonalOs } from "@hermes-os/orchestrator/system";
import { startChatServer } from "@hermes-os/chat-server";
import { IMessageBridge } from "@hermes-os/imessage-bridge";

const root = findWorkspaceRoot();
try {
  loadEnvFile(resolve(root, ".env"));
} catch {
  /* optional */
}

const cmd = (process.argv[2] ?? "start").toLowerCase();

async function runStart(): Promise<void> {
  await startDaemon();
}

async function runChatOnly(): Promise<void> {
  const sys = bootstrapPersonalOs({ workspaceRoot: root });
  startChatServer(sys);
  console.log("Hermes chat-only mode (no proactive scheduler)");
}

async function runIMessageOnly(): Promise<void> {
  const sys = bootstrapPersonalOs({ workspaceRoot: root });
  console.log("Hermes iMessage bridge (full stack: `hermes start`)");
  const bridge = new IMessageBridge(sys.orchestrator);
  await bridge.runLoop();
}

try {
  switch (cmd) {
    case "start":
    case "daemon":
      await runStart();
      break;
    case "chat":
      await runChatOnly();
      break;
    case "imessage":
      await runIMessageOnly();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(`Hermes Personal OS

Usage: hermes <command>

Commands:
  start, daemon   Run full stack (scheduler, chat UI, health, notifications)
  chat            Chat web UI only
  imessage        iMessage bridge only
  help            Show this message
`);
      break;
    default:
      console.error(`Unknown command: ${cmd}. Try: hermes help`);
      process.exit(1);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
