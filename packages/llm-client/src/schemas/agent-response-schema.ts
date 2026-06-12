import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { MEMORY_CANDIDATE_SCHEMA, memoryCandidateSchema } from "./memory-candidate-schema.js";

export const TOOL_REQUEST_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["tool", "payload"],
  additionalProperties: false,
  properties: {
    tool: { type: "string", description: "Exact tool name from registry, e.g. gmail.check_inbox" },
    payload: { type: "object", description: "Tool payload matching the tool schema" },
    reason: { type: "string", description: "One-sentence reason for this tool call" },
  },
};

export const SKILL_CANDIDATE_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["name", "description", "triggerExamples"],
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    triggerExamples: {
      type: "array",
      items: { type: "string" },
      description: "At least two example phrases that should trigger this skill",
    },
    suggestedSteps: {
      type: "array",
      items: {
        type: "object",
        required: ["tool", "payload"],
        additionalProperties: false,
        properties: {
          tool: { type: "string" },
          payload: { type: "object" },
        },
      },
    },
  },
};

export const AGENT_RESPONSE_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["final", "toolRequests", "memoryCandidates", "skillCandidates", "reasoningSummary"],
  additionalProperties: false,
  properties: {
    final: {
      type: ["string", "null"],
      description: "Final user-facing response. Set to null if toolRequests are needed first.",
    },
    toolRequests: {
      type: "array",
      items: TOOL_REQUEST_SCHEMA,
      description: "Tools to execute before responding. Empty if final is set.",
    },
    memoryCandidates: {
      type: "array",
      items: MEMORY_CANDIDATE_SCHEMA,
    },
    skillCandidates: {
      type: "array",
      items: SKILL_CANDIDATE_SCHEMA,
      description: "Suggest a new skill if this task recurs.",
    },
    reasoningSummary: {
      type: "string",
      description: "Internal reasoning summary (not shown to user).",
    },
  },
};

export const toolRequestSchema = z.object({
  tool: z.string(),
  payload: z.record(z.unknown()),
  reason: z.string().optional(),
});

export const skillCandidateSchema = z.object({
  name: z.string(),
  description: z.string(),
  triggerExamples: z.array(z.string()).min(2),
  suggestedSteps: z
    .array(
      z.object({
        tool: z.string(),
        payload: z.record(z.unknown()),
      }),
    )
    .optional(),
});

export const agentResponseSchema = z.object({
  final: z.string().nullable(),
  toolRequests: z.array(toolRequestSchema),
  memoryCandidates: z.array(memoryCandidateSchema),
  skillCandidates: z.array(skillCandidateSchema),
  reasoningSummary: z.string(),
});

export type ToolRequest = z.infer<typeof toolRequestSchema>;
export type SkillCandidate = z.infer<typeof skillCandidateSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;

export function validateAgentResponse(raw: unknown): AgentResponse {
  return agentResponseSchema.parse(raw);
}

export const EMPTY_AGENT_RESPONSE: AgentResponse = {
  final: null,
  toolRequests: [],
  memoryCandidates: [],
  skillCandidates: [],
  reasoningSummary: "",
};
