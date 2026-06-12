import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

export const MEMORY_OPERATION_SCHEMA: JSONSchema7 = {
  type: "object",
  required: [
    "operation",
    "content",
    "memory_type",
    "confidence",
    "scope",
    "tags",
    "search_query",
    "response",
  ],
  additionalProperties: false,
  properties: {
    operation: { type: "string", enum: ["remember", "forget", "search"] },
    content: { type: ["string", "null"] },
    memory_type: {
      type: ["string", "null"],
      enum: [
        "durable_fact",
        "preference",
        "project_context",
        "relationship_fact",
        "workflow",
        "open_loop",
        "research",
        null,
      ],
    },
    confidence: { type: ["number", "null"], description: "Confidence from 0.0 to 1.0, or null" },
    scope: { type: ["string", "null"] },
    tags: { type: "array", items: { type: "string" } },
    search_query: { type: ["string", "null"] },
    response: { type: "string", description: "What to say to the user after the operation" },
  },
};

export const memoryOperationSchema = z.object({
  operation: z.enum(["remember", "forget", "search"]),
  content: z.string().nullable(),
  memory_type: z
    .enum([
      "durable_fact",
      "preference",
      "project_context",
      "relationship_fact",
      "workflow",
      "open_loop",
      "research",
    ])
    .nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  scope: z.string().nullable(),
  tags: z.array(z.string()),
  search_query: z.string().nullable(),
  response: z.string(),
});

export type MemoryOperation = z.infer<typeof memoryOperationSchema>;

export function validateMemoryOperation(raw: unknown): MemoryOperation {
  return memoryOperationSchema.parse(raw);
}
