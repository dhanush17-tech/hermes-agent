import type { AuditLogger } from "@hermes-os/audit-log";
import type {
  AssistantStateRepository,
  OpenLoopsRepository,
  SourceItemsRepository,
  TasksRepository,
} from "@hermes-os/context-graph";
import type { ProactivityPolicy } from "@hermes-os/policies";
import { isPresenceScanEnabled, loadAutonomyPolicy } from "@hermes-os/policies";
import type { NotificationCenter } from "@hermes-os/notification-center";
import { ProactiveScanner, createDefaultConnectorHub } from "@hermes-os/connectors";
import { executeIMessageSend } from "@hermes-os/tool-executor";
import type { Orchestrator } from "./orchestrator.js";

export type ProactiveSchedulerHandle = {
  stop: () => void;
};

function parseHourEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
}

export function startProactiveScheduler(deps: {
  orchestrator: Orchestrator;
  audit: AuditLogger;
  sourceItems: SourceItemsRepository;
  openLoops: OpenLoopsRepository;
  tasks: TasksRepository;
  stateRepo: AssistantStateRepository;
  policy: ProactivityPolicy;
  workspaceRoot: string;
  notifyHandle?: string;
  notificationCenter?: NotificationCenter | null;
}): ProactiveSchedulerHandle {
  const intervalMs = Number(process.env.PROACTIVE_SCAN_INTERVAL_MS ?? 900_000);
  const feedWatchIntervalMs = Number(process.env.FEED_WATCH_INTERVAL_MS ?? 180_000);
  const startupGraceMs = Number(process.env.PROACTIVE_STARTUP_GRACE_MS ?? 300_000);
  const morningHour = parseHourEnv("PROACTIVE_MORNING_BRIEF_HOUR", 7);
  const eveningHour = parseHourEnv("PROACTIVE_EVENING_REVIEW_HOUR", 21);
  const autonomy = loadAutonomyPolicy();
  const presenceScanEnabled = isPresenceScanEnabled(autonomy);
  const startedAt = Date.now();

  const hub = createDefaultConnectorHub(deps.sourceItems, deps.workspaceRoot);
  const scanner = new ProactiveScanner(
    hub,
    deps.sourceItems,
    deps.openLoops,
    deps.tasks,
    deps.stateRepo,
    deps.policy,
    deps.audit,
    deps.workspaceRoot,
  );

  let stopped = false;
  let lastMorningDate = "";
  let lastEveningDate = "";

  const sendFallback = async (text: string) => {
    const recipient = deps.notifyHandle ?? process.env.IMESSAGE_DEFAULT_RECIPIENT;
    if (recipient) {
      await executeIMessageSend({ body: text, recipient });
    } else {
      console.log(text);
    }
  };

  const dispatchNotification = async (payload: {
    type: "risk" | "brief" | "reminder";
    title: string;
    body: string;
    score: number;
    dedupeKey: string;
    priority?: "low" | "medium" | "high" | "urgent";
  }) => {
    if (deps.notificationCenter) {
      const result = await deps.notificationCenter.dispatch({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        priority: payload.priority ?? (payload.score >= 85 ? "urgent" : payload.score >= 70 ? "high" : "medium"),
        score: payload.score,
        dedupeKey: payload.dedupeKey,
      });
      if (result.sent) return;
      if (result.reason === "below_threshold" || result.reason === "dedupe") return;
    }
    await sendFallback(`[Hermes] ${payload.title}\n${payload.body.slice(0, 280)}`);
  };

  const tick = async () => {
    if (stopped) return;
    const state = await deps.stateRepo.getState();
    if (state !== "running") return;
    if (await deps.orchestrator.isProactivePaused()) return;

    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10);

    try {
      const ctx = {
        actor: "system",
        workspaceRoot: deps.workspaceRoot,
      };

      if (
        presenceScanEnabled &&
        Date.now() - startedAt >= startupGraceMs
      ) {
        const presence = await deps.orchestrator.runPresenceScan(ctx);
        if (presence) {
          await deps.audit.log({
            eventType: "presence_scan",
            actor: "system",
            payload: { preview: presence.slice(0, 200) },
          });
        }
      }

      if (now.getHours() === morningHour && lastMorningDate !== dateKey) {
        lastMorningDate = dateKey;
        const brief = await deps.orchestrator.runMorningBrief();
        await dispatchNotification({
          type: "brief",
          title: "Morning brief",
          body: brief.slice(0, 1200),
          score: 75,
          dedupeKey: `brief:morning:${dateKey}`,
          priority: "medium",
        });
        await deps.audit.log({
          eventType: "proactive_notification_sent",
          actor: "system",
          payload: { type: "morning_brief" },
        });
      }

      if (now.getHours() === eveningHour && lastEveningDate !== dateKey) {
        lastEveningDate = dateKey;
        const review = await deps.orchestrator.runEveningReview();
        await dispatchNotification({
          type: "brief",
          title: "Evening review",
          body: review.slice(0, 1200),
          score: 70,
          dedupeKey: `brief:evening:${dateKey}`,
          priority: "medium",
        });
        await deps.audit.log({
          eventType: "proactive_notification_sent",
          actor: "system",
          payload: { type: "evening_review" },
        });
      }

      const notifications = await scanner.runScan();
      for (const n of notifications) {
        if (n.score < deps.policy.immediate_score_min) continue;
        await dispatchNotification({
          type: "risk",
          title: n.title,
          body: n.body,
          score: n.score,
          dedupeKey: n.dedupeKey,
        });
        await deps.audit.log({
          eventType: "proactive_notification_sent",
          actor: "system",
          payload: n,
        });
      }
    } catch (err) {
      console.error("Proactive scan failed:", err instanceof Error ? err.message : err);
    }
  };

  const feedWatchTick = async () => {
    if (stopped) return;
    const state = await deps.stateRepo.getState();
    if (state !== "running") return;
    if (await deps.orchestrator.isProactivePaused()) return;
    if (Date.now() - startedAt < startupGraceMs) return;

    try {
      const ctx = { actor: "system", workspaceRoot: deps.workspaceRoot };
      const alert = await deps.orchestrator.runFeedWatchTick(ctx, deps.notificationCenter);
      if (alert) {
        await deps.audit.log({
          eventType: "presence_scan",
          actor: "system",
          payload: { kind: "feed_watch_tick", preview: alert.slice(0, 300) },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Feed watch failed:", msg);
      await deps.audit.log({
        eventType: "agent_finished",
        actor: "system",
        payload: { kind: "feed_watch_tick_error", error: msg.slice(0, 400) },
      });
    }
  };

  void tick();
  void feedWatchTick();
  const timer = setInterval(() => void tick(), intervalMs);
  const feedTimer = setInterval(() => void feedWatchTick(), feedWatchIntervalMs);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      clearInterval(feedTimer);
    },
  };
}
