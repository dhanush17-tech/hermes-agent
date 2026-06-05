import {
  withAssistantPolicy,
  type CloudflareWorkersAIClient,
  type HermesModelProvider,
  type ToolContext,
} from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { AutonomousAgent } from "./autonomous-agent.js";

export class CodingAgent {
  constructor(
    private readonly hermes: HermesModelProvider | null,
    private readonly cf: CloudflareWorkersAIClient | null,
    private readonly executor: ToolExecutor | null,
    private readonly registry: ToolRegistry | null,
    private readonly workspaceRoot: string,
    private readonly activity: ActivityMonitor,
  ) {}

  async run(instruction: string, ctx?: ToolContext): Promise<string> {
    if (this.cf && this.executor && this.registry && ctx) {
      const agent = new AutonomousAgent(
        this.cf,
        this.executor,
        this.registry,
        this.workspaceRoot,
        this.activity,
      );
      return agent.run(instruction, ctx, {
        classification: "coding",
        hint: [
          "Prefer code.self_edit (Hermes) for repo changes.",
          "Use filesystem.write for new files in the workspace.",
          "Use tools.author to define reusable custom.* macros when the user wants a new capability.",
        ].join(" "),
      });
    }

    if (this.hermes) {
      const ok = await this.hermes.healthCheck();
      if (ok) {
        return this.hermes.chat(instruction, { sessionKey: "hermes-personal-os-coding" });
      }
    }
    if (this.cf) {
      return this.cf.chat(instruction, {
        classification: "coding",
        maxTokens: 4096,
        system: withAssistantPolicy(
          "You are a senior engineer working on the Hermes Personal OS monorepo. Propose concrete file-level changes; use code.self_edit when execution is available.",
        ),
      });
    }
    return "Coding assistant unavailable. Set HERMES_API_URL + HERMES_API_KEY or Cloudflare credentials.";
  }
}
