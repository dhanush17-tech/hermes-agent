import type { AgentRunInput, AgentRunOutput, RuntimeKind } from "./types.js";

export interface AgentRuntime {
  kind: RuntimeKind;
  isAvailable(): Promise<boolean>;
  run(input: AgentRunInput): Promise<AgentRunOutput>;
  continue(sessionId: string, input: AgentRunInput): Promise<AgentRunOutput>;
}
