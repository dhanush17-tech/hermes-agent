import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentRunInput, AgentRunOutput } from "./types.js";
import { buildAgentPrompt, parseAgentRunOutput } from "./hermes-tool-protocol.js";

export class CloudflareRuntime implements AgentRuntime {
  readonly kind = "cloudflare" as const;

  constructor(private readonly cloudflare: CloudflareWorkersAIClient | null) {}

  async isAvailable(): Promise<boolean> {
    if (!this.cloudflare) return false;
    return this.cloudflare.healthCheck();
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    return this.callCloudflare(input, input.sessionId ?? newSessionId());
  }

  async continue(sessionId: string, input: AgentRunInput): Promise<AgentRunOutput> {
    return this.callCloudflare({ ...input, sessionId }, sessionId);
  }

  private async callCloudflare(input: AgentRunInput, sessionId: string): Promise<AgentRunOutput> {
    if (!this.cloudflare) {
      throw new Error("Cloudflare runtime is not configured");
    }
    const raw = await this.cloudflare.chat(buildAgentPrompt(input), {
      classification: input.taskKind === "coding" ? "coding" : "unknown",
      maxTokens: 4096,
      system:
        "You are the fallback cognitive runtime for Hermes Personal OS. Return only the requested JSON shape. Do not claim tool execution; request tools instead.",
    });
    return parseAgentRunOutput(raw, sessionId);
  }
}

function newSessionId(): string {
  return `cloudflare_runtime_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
