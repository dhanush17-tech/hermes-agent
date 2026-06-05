import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { findWorkspaceRoot } from "@hermes-os/shared";
import {
  createDb,
  runMigrations,
  NotificationHistoryRepository,
} from "@hermes-os/context-graph";
import { bootstrapPersonalOs } from "@hermes-os/orchestrator/system";
import { startProactiveScheduler } from "@hermes-os/orchestrator/proactive-scheduler";
import { loadProactivityPolicy } from "@hermes-os/policies";
import {
  NotificationCenter,
  NotificationPolicy,
  IMessageNotificationChannel,
} from "@hermes-os/notification-center";
import { executeIMessageSend } from "@hermes-os/tool-executor";
import { startChatServer } from "@hermes-os/chat-server";
import { IMessageBridge } from "@hermes-os/imessage-bridge";
import { startHealthServer, type HealthStatus } from "./health.js";
import { createLifecycle } from "./lifecycle.js";

export type DaemonHandle = {
  health: HealthStatus;
  stop: () => Promise<void>;
};

export async function startDaemon(): Promise<DaemonHandle> {
  const root = findWorkspaceRoot();
  try {
    loadEnvFile(resolve(root, ".env"));
  } catch {
    /* optional */
  }

  const startedAt = Date.now();
  const lifecycle = createLifecycle();

  const sys = bootstrapPersonalOs({ workspaceRoot: root });

  let schedulerRunning = false;
  let notificationRunning = false;
  let dbOk = true;

  const { db, sqlite } = createDb(sys.dbPath);
  try {
    runMigrations(sqlite);
  } catch {
    dbOk = false;
  }

  const expiryWatcher = sys.broker.startExpiryWatcher();
  lifecycle.register("approval-expiry-watcher", () => expiryWatcher.stop());

  const notificationHistory = new NotificationHistoryRepository(db);
  const proactivity = loadProactivityPolicy();
  const notificationCenter = new NotificationCenter(
    notificationHistory,
    new NotificationPolicy({
      immediateScoreMin: proactivity.immediate_score_min,
      digestScoreMin: proactivity.daily_brief_score_min,
      quietHoursStart: Number(process.env.HERMES_QUIET_HOURS_START),
      quietHoursEnd: Number(process.env.HERMES_QUIET_HOURS_END),
    }),
  );

  const recipient = process.env.IMESSAGE_DEFAULT_RECIPIENT;
  if (recipient) {
    notificationCenter.addChannel(
      new IMessageNotificationChannel(
        async (text, to) => {
          await executeIMessageSend({ body: text, recipient: to });
        },
        recipient,
      ),
    );
  }

  const notificationHandle = notificationCenter.start();
  notificationRunning = true;
  lifecycle.register("notification-center", () => notificationHandle.stop());

  const scheduler = startProactiveScheduler({
    orchestrator: sys.orchestrator,
    audit: sys.audit,
    sourceItems: sys.sourceItemsRepo,
    openLoops: sys.openLoopsRepo,
    tasks: sys.tasksRepo,
    stateRepo: sys.stateRepo,
    policy: proactivity,
    workspaceRoot: root,
    notifyHandle: recipient,
    notificationCenter,
  });
  schedulerRunning = true;
  lifecycle.register("proactive-scheduler", () => scheduler.stop());

  if (process.env.HERMES_DISABLE_CHAT !== "1") {
    startChatServer(sys);
    console.log(`Chat UI: http://127.0.0.1:${process.env.HERMES_CHAT_PORT ?? 3847}`);
  }

  if (process.env.HERMES_ENABLE_IMESSAGE === "1") {
    const bridge = new IMessageBridge(sys.orchestrator);
    void bridge.runLoop().catch((err) => {
      console.error("iMessage bridge error:", err instanceof Error ? err.message : err);
    });
    console.log("iMessage bridge: enabled (HERMES_ENABLE_IMESSAGE=1)");
  }

  const getHealth = (): HealthStatus => ({
    status: "running",
    scheduler: schedulerRunning ? "running" : "stopped",
    database: dbOk ? "ok" : "error",
    approvalBroker: "ok",
    notificationCenter: notificationRunning ? "running" : "stopped",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });

  const port = Number(process.env.HERMES_DAEMON_PORT ?? 3850);
  const healthServer = startHealthServer(getHealth, port);
  lifecycle.register("health-server", () => healthServer.stop());

  console.log(`Hermes daemon running on http://127.0.0.1:${port}/health`);
  console.log(`Database: ${sys.dbPath}`);
  console.log(`Activity JSONL: ${root}/data/activity.jsonl`);
  if (recipient) console.log(`Proactive iMessage recipient: ${recipient}`);

  return {
    health: getHealth(),
    stop: () => lifecycle.shutdown("manual"),
  };
}
