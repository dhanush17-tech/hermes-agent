import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { ContextGraphService } from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";
import { ResearchEngine } from "@hermes-os/research";

export class ResearchAgent {
  private readonly engine: ResearchEngine;

  constructor(
    cf: CloudflareWorkersAIClient,
    memory: MemoryService,
    options?: {
      workspaceRoot: string;
      contextGraph?: ContextGraphService | null;
    },
  ) {
    this.engine = new ResearchEngine({
      cf,
      memory,
      workspaceRoot: options?.workspaceRoot ?? process.cwd(),
      contextGraph: options?.contextGraph ?? null,
    });
  }

  async run(
    query: string,
    options?: { system?: string; memoryTopic?: string; isFollowUp?: boolean },
  ): Promise<string> {
    return this.engine.run(query, options);
  }
}
