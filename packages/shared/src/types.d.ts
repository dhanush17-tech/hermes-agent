import type { SteerController } from "./steer-controller.js";
export type RiskLevel = "read" | "low" | "medium" | "high" | "dynamic";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";
export type RiskLevelApproval = "medium" | "high" | "critical";
export type ApprovalChannel = "imessage" | "web" | "cli";
export type CapabilityLease = {
    id: string;
    approvalId: string;
    toolName: string;
    payloadHash: string;
    riskLevel: RiskLevelApproval;
    approvedBy: string;
    approvedChannel: ApprovalChannel;
    allowedDestination?: string;
    allowedAccount?: string;
    maxUses: number;
    usedCount: number;
    expiresAt: string;
    createdAt: string;
};
export type Approval = {
    id: string;
    actionType: string;
    summary: string;
    exactPayload: unknown;
    payloadHash: string;
    riskLevel: RiskLevelApproval;
    status: ApprovalStatus;
    createdAt: string;
    expiresAt: string;
    resolvedAt?: string;
};
export type AuditEventType = "incoming_message" | "outgoing_message" | "tool_call_requested" | "tool_call_executed" | "tool_call_denied" | "approval_requested" | "approval_approved" | "approval_denied" | "memory_created" | "memory_updated" | "proactive_scan_started" | "proactive_notification_sent" | "intent_classified" | "agent_invoked" | "agent_step" | "agent_finished" | "agent_blocked" | "presence_scan" | "risk_detected" | "research_started" | "research_completed" | "hindrance_reported" | "hindrance_cleared" | "capability_lease_created" | "capability_lease_consumed" | "capability_lease_expired";
export type RequestClassification = "research" | "personal_ops" | "writing" | "coding" | "laptop_control" | "browser_task" | "approval_response" | "memory_update" | "status" | "unknown";
export type AssistantState = "running" | "paused" | "emergency_stop";
export type InboundMessage = {
    channel: "cli" | "imessage" | "web";
    senderId: string;
    text: string;
    receivedAt: string;
};
export type ChatTurn = {
    role: "user" | "assistant";
    content: string;
};
/** Thrown / returned when a run is cancelled for user steering. */
export declare const HERMES_INTERRUPTED = "HERMES_INTERRUPTED";
export type HandleMessageOptions = {
    signal?: AbortSignal;
    /** When set, user messages can steer between steps without aborting browser state. */
    steerController?: SteerController;
    /** Prior turns for this sender (messaging channels). Orchestrator fills this if omitted. */
    conversationHistory?: ChatTurn[];
    /** Skip appending this exchange to the session store (internal retries). */
    skipSessionAppend?: boolean;
};
export declare function throwIfAborted(signal?: AbortSignal): void;
export type ToolContext = {
    actor: string;
    approvalId?: string;
    workspaceRoot: string;
    channel?: "cli" | "imessage" | "web";
    conversationHistory?: ChatTurn[];
};
export type ToolResult = {
    status: "success";
    data: unknown;
} | {
    status: "pending_approval";
    approvalId: string;
    message: string;
} | {
    status: "denied";
    reason: string;
};
export type PolicyEvaluation = {
    allowed: boolean;
    risk: RiskLevel;
    requiresApproval: boolean;
    reason?: string;
};
export type PolicyContext = {
    workspaceRoot: string;
    targetPath?: string;
    terminalCommand?: string;
};
//# sourceMappingURL=types.d.ts.map