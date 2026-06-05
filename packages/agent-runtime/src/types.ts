export type RuntimeKind = "local" | "cloudflare" | "hermes_primary";

export type AgentTaskKind =
  | "research"
  | "coding"
  | "browser_task"
  | "personal_ops"
  | "memory_synthesis"
  | "proactive_reasoning"
  | "general"
  | "classification"
  | "extraction"
  | "vision";

export type AgentToolRiskHint = "read" | "low" | "medium" | "high" | "critical";
export type RiskHint = AgentToolRiskHint;

export type ToolDescription = {
  name: string;
  purpose: string;
  riskLevel: AgentToolRiskHint;
  approval: "never" | "sometimes" | "always";
  inputSchema?: unknown;
  examples?: unknown[];
  whenToUse?: string;
  whenNotToUse?: string;
};

export type AgentRunInput = {
  taskKind: AgentTaskKind;
  userMessage: string;
  sessionId?: string;
  systemContext: {
    userProfile?: string;
    relevantMemories?: unknown[];
    dailyContext?: unknown;
    activeProjects?: unknown[];
    openLoops?: unknown[];
    availableTools: ToolDescription[];
    riskPolicySummary: string;
  };
  constraints: {
    mustUseToolExecutor: true;
    mustRequestApprovalForHighRisk: true;
    cannotAccessRawSecrets: true;
  };
};

export type AgentRunOutput = {
  final?: string;
  toolRequests?: AgentToolRequest[];
  memoryCandidates?: MemoryCandidate[];
  skillCandidates?: SkillCandidate[];
  reasoningSummary?: string;
  sessionId?: string;
};

export type AgentToolRequest = {
  toolName: string;
  payload: unknown;
  reason: string;
  expectedResult?: string;
  riskHint?: AgentToolRiskHint;
};

export type AgentToolResult = {
  request: AgentToolRequest;
  result: unknown;
};

export type MemoryCandidate = {
  type:
    | "user_preference"
    | "project_fact"
    | "relationship_fact"
    | "workflow"
    | "habit_hypothesis";
  content: string;
  scope?: string;
  confidence: "low" | "medium" | "high";
  evidenceIds?: string[];
  sensitivity: "normal" | "private" | "sensitive";
};

export type SkillCandidate = {
  name: string;
  description: string;
  triggerExamples: string[];
  steps: AgentToolRequest[];
  safetyNotes: string[];
};
