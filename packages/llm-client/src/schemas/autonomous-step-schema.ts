import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { MEMORY_CANDIDATE_SCHEMA, memoryCandidateSchema } from "./memory-candidate-schema.js";

export const AUTONOMOUS_STEP_SCHEMA: JSONSchema7 = {
  type: "object",
  required: [
    "think",
    "action",
    "tool",
    "payload",
    "summary",
    "final",
    "question",
    "memoryCandidates",
  ],
  additionalProperties: false,
  properties: {
    think: {
      type: "string",
      description: "One sentence: current state and what needs to happen next",
    },
    action: { type: "string", enum: ["continue", "finish", "need_user"] },
    tool: { type: ["string", "null"], description: "Tool to call when action=continue" },
    payload: { type: "object", description: "Tool payload when action=continue" },
    summary: { type: "string", description: "What this step accomplishes" },
    final: { type: ["string", "null"], description: "Final result when action=finish" },
    question: { type: ["string", "null"], description: "Single question when action=need_user" },
    memoryCandidates: { type: "array", items: MEMORY_CANDIDATE_SCHEMA },
  },
};

export const autonomousStepSchema = z.object({
  think: z.string(),
  action: z.enum(["continue", "finish", "need_user"]),
  tool: z.string().nullable(),
  payload: z.record(z.unknown()),
  summary: z.string(),
  final: z.string().nullable(),
  question: z.string().nullable(),
  memoryCandidates: z.array(memoryCandidateSchema),
});

export type AutonomousStep = z.infer<typeof autonomousStepSchema>;

export function validateAutonomousStep(raw: unknown): AutonomousStep {
  return autonomousStepSchema.parse(raw);
}
