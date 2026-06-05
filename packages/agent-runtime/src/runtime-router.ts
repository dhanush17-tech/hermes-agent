import type { RequestClassification } from "@hermes-os/shared";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentTaskKind, RuntimeKind } from "./types.js";

export type RuntimeRouterDeps = {
  hermes: AgentRuntime;
  cloudflare: AgentRuntime;
};

export class RuntimeRouter {
  constructor(private readonly deps: RuntimeRouterDeps) {}

  async choose(intent: RequestClassification | AgentTaskKind): Promise<AgentRuntime | null> {
    const kind = await this.chooseKind(intent);
    if (kind === "local") return null;
    return kind === "hermes_primary" ? this.deps.hermes : this.deps.cloudflare;
  }

  async chooseKind(intent: RequestClassification | AgentTaskKind): Promise<RuntimeKind> {
    if (isLocalOnlyIntent(intent)) return "local";
    if (isCloudflareUtilityIntent(intent)) return "cloudflare";
    if (await this.deps.hermes.isAvailable()) return "hermes_primary";
    if (await this.deps.cloudflare.isAvailable()) return "cloudflare";
    return "local";
  }
}

export function mapIntentToTaskKind(intent: RequestClassification): AgentTaskKind {
  switch (intent) {
    case "research":
      return "research";
    case "coding":
      return "coding";
    case "browser_task":
    case "laptop_control":
      return "browser_task";
    case "personal_ops":
    case "writing":
      return "personal_ops";
    case "memory_update":
      return "memory_synthesis";
    case "unknown":
      return "general";
    case "approval_response":
    case "status":
      return "general";
  }
}

function isLocalOnlyIntent(intent: RequestClassification | AgentTaskKind): boolean {
  return intent === "approval_response" || intent === "status";
}

function isCloudflareUtilityIntent(intent: RequestClassification | AgentTaskKind): boolean {
  return intent === "classification" || intent === "extraction";
}
