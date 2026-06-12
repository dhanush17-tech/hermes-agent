import type { JSONSchema7 } from "json-schema";
import { z } from "zod";

export const INTENT_SCHEMA: JSONSchema7 = {
  type: "object",
  required: ["intent", "confidence", "entities", "routing_hint"],
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "research",
        "approval_response",
        "status",
        "laptop_control",
        "coding",
        "writing",
        "browser_task",
        "memory_update",
        "personal_ops",
        "unknown",
      ],
      description: "Classified intent",
    },
    confidence: {
      type: "number",
      description: "Classification confidence from 0.0 to 1.0",
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        required: ["type", "value"],
        additionalProperties: false,
        properties: {
          type: { type: "string", description: "e.g. app, person, url, product, time, location" },
          value: { type: "string" },
        },
      },
    },
    routing_hint: {
      type: "string",
      description: "One-sentence hint for the router about how to handle this",
    },
  },
};

export const intentEntitySchema = z.object({
  type: z.string(),
  value: z.string(),
});

export const intentResultSchema = z.object({
  intent: z.enum([
    "research",
    "approval_response",
    "status",
    "laptop_control",
    "coding",
    "writing",
    "browser_task",
    "memory_update",
    "personal_ops",
    "unknown",
  ]),
  confidence: z.number().min(0).max(1),
  entities: z.array(intentEntitySchema),
  routing_hint: z.string(),
});

export type IntentEntity = z.infer<typeof intentEntitySchema>;
export type IntentResult = z.infer<typeof intentResultSchema>;

export const UNKNOWN_INTENT_RESULT: IntentResult = {
  intent: "unknown",
  confidence: 0,
  entities: [],
  routing_hint: "Classification failed; treat as general conversation.",
};

export function validateIntentResult(raw: unknown): IntentResult {
  return intentResultSchema.parse(raw);
}
