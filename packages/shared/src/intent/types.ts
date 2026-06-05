import type { RequestClassification } from "../types.js";

export const REQUEST_CLASSIFICATIONS = [
  "research",
  "approval_response",
  "status",
  "laptop_control",
  "coding",
  "writing",
  "browser_task",
  "personal_ops",
  "memory_update",
  "unknown",
] as const satisfies readonly RequestClassification[];

export type IntentEntities = {
  approvalAction?: "approve" | "deny" | "edit";
  approvalId?: string;
  criticalConfirmed?: boolean;
  editText?: string;
  assistantControl?: "status" | "pause" | "resume" | "emergency_stop";
  researchContinue?: boolean;
  researchEnd?: boolean;
  toolName?:
    | "social.post"
    | "code.self_edit"
    | "imessage.send"
    | "web.fetch"
    | "screen.observe"
    | "browser.goto"
    | "memory.remember"
    | "memory.forget"
    | "terminal.run"
    | "filesystem.write"
    | "tools.define"
    | "tools.author"
    | "tools.run";
  payloadText?: string;
  url?: string;
  memoryAction?: "remember" | "forget" | "search";
  memoryId?: string;
};

export type ClassifiedIntent = {
  intent: RequestClassification;
  confidence: number;
  reasoning?: string;
  entities?: IntentEntities;
};

export type IntentCatalogEntry = {
  id: RequestClassification;
  description: string;
  implemented: boolean | "partial";
};

export type IntentCatalog = {
  classifier_model: string;
  intents: IntentCatalogEntry[];
};
