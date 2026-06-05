import type { HermesModelProvider } from "@hermes-os/shared";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentRunInput, AgentRunOutput } from "./types.js";
import { buildAgentPrompt, parseAgentRunOutput } from "./hermes-tool-protocol.js";

export class HermesGatewayRuntime implements AgentRuntime {
  readonly kind = "hermes_primary" as const;

  constructor(private readonly hermes: HermesModelProvider | null) {}

  async isAvailable(): Promise<boolean> {
    return this.hermes ? this.hermes.healthCheck() : false;
  }

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    if (!this.hermes) return { final: "Hermes gateway is not configured." };
    const sessionId = input.sessionId ?? newSessionId();
    const raw = await this.hermes.chat(buildAgentPrompt({ ...input, sessionId }), {
      sessionKey: sessionId,
    });
    return parseAgentRunOutput(raw, sessionId);
  }

  async continue(sessionId: string, input: AgentRunInput): Promise<AgentRunOutput> {
    if (!this.hermes) return { final: "Hermes gateway is not configured.", sessionId };
    const raw = await this.hermes.chat(buildAgentPrompt({ ...input, sessionId }), {
      sessionKey: sessionId,
    });
    return parseAgentRunOutput(raw, sessionId);
  }
}

function newSessionId(): string {
  return `hermes_primary_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
