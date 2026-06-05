import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AuditEventType } from "@hermes-os/shared";
import type { AuditLogger, AuditLogParams } from "./audit-logger.js";
import { formatActivityLine, type ActivityRow } from "./format-activity.js";

export type { ActivityRow } from "./format-activity.js";
export type ActivitySubscriber = (row: ActivityRow) => void;

export type AgentName =
  | "Router"
  | "ResearchAgent"
  | "ChiefOfStaffAgent"
  | "AutonomousAgent"
  | "LaptopControlAgent"
  | "RiskPredictionAgent"
  | "DigitalPresenceMonitor"
  | "MemoryAgent"
  | "CodingAgent"
  | "WritingAgent"
  | "BrowserAgent"
  | "GeneralAgent"
  | "ApprovalAgent"
  | "OperatorAgent"
  | "HermesSystem";

export type ActivityMonitorOptions = {
  workspaceRoot: string;
  /** Mirror lines to stdout (default: env HERMES_ACTIVITY_CONSOLE=1) */
  console?: boolean;
  /** Append JSONL to data/activity.jsonl (default: true unless HERMES_ACTIVITY_JSONL=0) */
  jsonl?: boolean;
};

export class ActivityMonitor {
  private readonly consoleEnabled: boolean;
  private readonly jsonlEnabled: boolean;
  private readonly jsonlPath: string;
  private readonly subscribers = new Set<ActivitySubscriber>();

  constructor(
    private readonly audit: AuditLogger,
    options: ActivityMonitorOptions,
  ) {
    this.consoleEnabled =
      options.console ?? process.env.HERMES_ACTIVITY_CONSOLE === "1";
    this.jsonlEnabled =
      options.jsonl ?? process.env.HERMES_ACTIVITY_JSONL !== "0";
    this.jsonlPath = resolve(options.workspaceRoot, "data/activity.jsonl");
  }

  /** Wire into AuditLogger to mirror every audit event (including tools). */
  attachToAuditLogger(logger: AuditLogger): void {
    logger.setMirror((params) => this.mirror(params));
  }

  /** Live stream for chat UI / WebSocket clients. */
  subscribe(fn: ActivitySubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  async agentStart(
    agent: AgentName,
    details: {
      intent?: string;
      routing?: string;
      messagePreview?: string;
      actor?: string;
    },
  ): Promise<void> {
    await this.record("agent_invoked", {
      actor: details.actor ?? "assistant",
      payload: { agent, ...details },
    });
  }

  async agentStep(
    agent: AgentName,
    step: {
      think?: string;
      tool?: string;
      status?: string;
      detail?: string;
    },
  ): Promise<void> {
    await this.record("agent_step", {
      actor: "assistant",
      toolName: step.tool,
      payload: { agent, ...step },
    });
  }

  async agentDone(
    agent: AgentName,
    details: { preview?: string; ok?: boolean; error?: string },
  ): Promise<void> {
    await this.record("agent_finished", {
      actor: "assistant",
      payload: { agent, preview: details.preview, error: details.error },
      result: { ok: details.ok !== false && !details.error },
    });
  }

  async agentBlocked(agent: AgentName, question: string, goal?: string): Promise<void> {
    await this.record("agent_blocked", {
      actor: "assistant",
      payload: { agent, question, goal },
    });
  }

  async presenceScan(service: string, summary: string, openLoops = 0): Promise<void> {
    await this.record("presence_scan", {
      actor: "system",
      payload: { service, summary, openLoops },
    });
  }

  private async record(
    eventType: AuditEventType,
    params: Omit<AuditLogParams, "eventType">,
  ): Promise<void> {
    await this.audit.log({ eventType, ...params });
  }

  private mirror(params: AuditLogParams & { createdAt?: string }): void {
    const row: ActivityRow = {
      id: "",
      eventType: params.eventType,
      actor: params.actor,
      toolName: params.toolName ?? null,
      payload: params.payload !== undefined ? JSON.stringify(params.payload) : null,
      result: params.result !== undefined ? JSON.stringify(params.result) : null,
      riskLevel: params.riskLevel ?? null,
      approvalId: params.approvalId ?? null,
      createdAt: params.createdAt ?? new Date().toISOString(),
    };
    const line = formatActivityLine(row);
    if (this.consoleEnabled) {
      console.log(`[Hermes] ${line}`);
    }
    if (this.jsonlEnabled) {
      void this.appendJsonl(row);
    }
    for (const fn of this.subscribers) {
      try {
        fn(row);
      } catch {
        /* subscriber error */
      }
    }
  }

  private async appendJsonl(row: ActivityRow): Promise<void> {
    try {
      await mkdir(dirname(this.jsonlPath), { recursive: true });
      await appendFile(this.jsonlPath, `${JSON.stringify(row)}\n`, "utf8");
    } catch {
      /* non-fatal */
    }
  }
}
