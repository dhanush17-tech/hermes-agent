import type {
  AgentRunInput,
  AgentRunOutput,
  AgentToolRequest,
  AgentToolRiskHint,
  MemoryCandidate,
  SkillCandidate,
  ToolDescription,
} from "./types.js";

export const HERMES_PRIMARY_SYSTEM_PROMPT = `You are the primary reasoning agent inside Hermes Personal OS.

Hermes Personal OS owns:
- tools
- approvals
- credentials
- audit logs
- context graph
- policy enforcement

You do not execute tools directly.
You propose tool calls in structured JSON.
All tool calls go through ToolExecutor.
High-risk actions require ApprovalBroker.
Never ask for raw secrets.
Never bypass approvals.
Never mutate files directly unless using approved code patch tools.
Prefer connector tools over browser/screenshot tools.
Use screen vision only as fallback.
Learn reusable workflows and suggest skill candidates when a task repeats.

Return only JSON:
{
  "final": "message to user if done",
  "toolRequests": [
    {
      "toolName": "...",
      "payload": {},
      "reason": "...",
      "expectedResult": "...",
      "riskHint": "read|low|medium|high|critical"
    }
  ],
  "memoryCandidates": [],
  "skillCandidates": [],
  "reasoningSummary": "brief summary"
}`;

const allowedRiskHints = new Set(["read", "low", "medium", "high", "critical"]);
const allowedMemoryTypes = new Set([
  "user_preference",
  "project_fact",
  "relationship_fact",
  "workflow",
  "habit_hypothesis",
]);
const allowedMemorySensitivity = new Set(["normal", "private", "sensitive"]);
const allowedConfidence = new Set(["low", "medium", "high"]);

export function buildAgentPrompt(input: AgentRunInput): string {
  return [
    HERMES_PRIMARY_SYSTEM_PROMPT,
    "",
    "Task:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

export function parseAgentRunOutput(raw: string, fallbackSessionId?: string): AgentRunOutput {
  const json = extractJsonObject(raw);
  if (!json) {
    return {
      final: raw.trim(),
      sessionId: fallbackSessionId,
      reasoningSummary: "Runtime returned plain text instead of structured JSON.",
    };
  }

  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return normalizeAgentRunOutput(parsed, fallbackSessionId);
  } catch {
    return {
      final: raw.trim(),
      sessionId: fallbackSessionId,
      reasoningSummary: "Runtime returned invalid JSON.",
    };
  }
}

export function buildDefaultToolCatalog(toolNames: string[]): ToolDescription[] {
  return [...new Set(toolNames)].sort().map((name) => {
    const metadata = toolMetadata(name);
    return {
      name,
      purpose: metadata.purpose,
      riskLevel: metadata.riskLevel,
      approval: metadata.approval,
      inputSchema: metadata.inputSchema,
      whenToUse: metadata.whenToUse,
      whenNotToUse: metadata.whenNotToUse,
    };
  });
}

export const buildToolCatalog = buildDefaultToolCatalog;

function normalizeAgentRunOutput(
  value: Record<string, unknown>,
  fallbackSessionId?: string,
): AgentRunOutput {
  const final = typeof value.final === "string" ? value.final : undefined;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : fallbackSessionId;
  const reasoningSummary =
    typeof value.reasoningSummary === "string" ? value.reasoningSummary : undefined;

  return {
    final,
    sessionId,
    reasoningSummary,
    toolRequests: normalizeToolRequests(value.toolRequests),
    memoryCandidates: normalizeMemoryCandidates(value.memoryCandidates),
    skillCandidates: normalizeSkillCandidates(value.skillCandidates),
  };
}

function normalizeToolRequests(value: unknown): AgentToolRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AgentToolRequest[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.toolName !== "string" || !record.toolName.trim()) return [];
    const riskHint = normalizeRiskHint(record.riskHint);
    return [
      {
        toolName: record.toolName.trim(),
        payload: record.payload ?? {},
        reason: typeof record.reason === "string" ? record.reason : `Run ${record.toolName}`,
        expectedResult:
          typeof record.expectedResult === "string" ? record.expectedResult : undefined,
        riskHint,
      },
    ];
  });
}

function normalizeMemoryCandidates(value: unknown): MemoryCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): MemoryCandidate[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.content !== "string" || !record.content.trim()) return [];
    const type = String(record.type ?? "");
    const confidence = String(record.confidence ?? "");
    const sensitivity = String(record.sensitivity ?? "");
    if (
      !allowedMemoryTypes.has(type) ||
      !allowedConfidence.has(confidence) ||
      !allowedMemorySensitivity.has(sensitivity)
    ) {
      return [];
    }
    return [
      {
        type: type as MemoryCandidate["type"],
        content: record.content.trim(),
        scope: typeof record.scope === "string" ? record.scope : undefined,
        confidence: confidence as MemoryCandidate["confidence"],
        evidenceIds: Array.isArray(record.evidenceIds)
          ? record.evidenceIds.filter((id): id is string => typeof id === "string")
          : [],
        sensitivity: sensitivity as MemoryCandidate["sensitivity"],
      },
    ];
  });
}

function normalizeSkillCandidates(value: unknown): SkillCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SkillCandidate[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string" || !record.name.trim()) return [];
    if (typeof record.description !== "string" || !record.description.trim()) return [];
    return [
      {
        name: record.name.trim(),
        description: record.description.trim(),
        triggerExamples: Array.isArray(record.triggerExamples)
          ? record.triggerExamples.filter((v): v is string => typeof v === "string")
          : [],
        steps: normalizeToolRequests(record.steps),
        safetyNotes: Array.isArray(record.safetyNotes)
          ? record.safetyNotes.filter((v): v is string => typeof v === "string")
          : [],
      },
    ];
  });
}

function normalizeRiskHint(value: unknown): AgentToolRiskHint | undefined {
  if (typeof value !== "string" || !allowedRiskHints.has(value)) return undefined;
  return value as AgentToolRiskHint;
}

function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced?.startsWith("{")) return fenced;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  return raw.slice(start, end + 1);
}

function toolMetadata(name: string): Omit<ToolDescription, "name"> {
  if (name.startsWith("gmail.")) {
    return {
      purpose: "Search, read, summarize, draft, or send Gmail through configured connectors.",
      riskLevel: name.includes("send") ? "high" : "read",
      approval: name.includes("send") ? "always" : "never",
      inputSchema: { type: "object" },
      whenToUse: "Use for email tasks before browser automation.",
      whenNotToUse: "Do not use if the task requires raw OAuth tokens.",
    };
  }
  if (name.startsWith("browser.")) {
    return {
      purpose: "Open, observe, click, fill, extract, or inspect web pages.",
      riskLevel: /click|fill|press|submit|run_script/.test(name) ? "medium" : "read",
      approval: /submit|run_script/.test(name) ? "sometimes" : "never",
      inputSchema: { type: "object" },
      whenToUse: "Use when no first-party connector exists or visual web interaction is required.",
      whenNotToUse: "Do not use to bypass connector APIs or approvals.",
    };
  }
  if (name.startsWith("code.")) {
    return {
      purpose: "Propose patches, run tests, apply approved patches, or roll back checkpoints.",
      riskLevel: /apply|rollback/.test(name) ? "high" : "medium",
      approval: /apply|rollback/.test(name) ? "always" : "sometimes",
      inputSchema: { type: "object" },
      whenToUse: "Use for repository coding workflows.",
      whenNotToUse: "Do not directly mutate production code without an approved patch path.",
    };
  }
  if (name.startsWith("memory.") || name.startsWith("context.")) {
    return {
      purpose: "Search or propose updates to Personal OS memory and context graph.",
      riskLevel: name.includes("forget") || name.includes("remember") ? "medium" : "read",
      approval: name.includes("forget") ? "sometimes" : "never",
      inputSchema: { type: "object" },
      whenToUse: "Use for personalization, recall, and memory candidates.",
      whenNotToUse: "Do not save secrets or sensitive facts without approval.",
    };
  }
  if (name.startsWith("terminal.")) {
    return {
      purpose: "Run or propose local terminal commands through policy-gated execution.",
      riskLevel: "high",
      approval: "sometimes",
      inputSchema: { type: "object" },
      whenToUse: "Use only when no safer structured tool exists.",
      whenNotToUse: "Do not use for destructive commands without approval.",
    };
  }
  return {
    purpose: `Execute ${name} through Hermes Personal OS ToolExecutor.`,
    riskLevel: "medium",
    approval: "sometimes",
    inputSchema: { type: "object" },
    whenToUse: "Use when this exact registered tool is the safest available primitive.",
    whenNotToUse: "Do not invent tools outside the catalog.",
  };
}
