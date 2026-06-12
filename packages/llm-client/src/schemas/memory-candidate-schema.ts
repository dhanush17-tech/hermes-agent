import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

export const MEMORY_CANDIDATE_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["content", "memory_type", "confidence"],
  additionalProperties: false,
  properties: {
    content: { type: "string" },
    memory_type: {
      type: "string",
      enum: [
        "durable_fact",
        "preference",
        "project_context",
        "relationship_fact",
        "workflow",
        "open_loop",
        "research",
      ],
    },
    confidence: { type: "number", description: "Confidence from 0.0 to 1.0" },
    scope: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
  },
};

export const memoryCandidateSchema = z.object({
  content: z.string(),
  memory_type: z.enum([
    "durable_fact",
    "preference",
    "project_context",
    "relationship_fact",
    "workflow",
    "open_loop",
    "research",
  ]),
  confidence: z.number().min(0).max(1),
  scope: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;
