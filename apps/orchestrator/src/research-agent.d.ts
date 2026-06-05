import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { ContextGraphService } from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";
export declare class ResearchAgent {
    private readonly engine;
    constructor(cf: CloudflareWorkersAIClient, memory: MemoryService, options?: {
        workspaceRoot: string;
        contextGraph?: ContextGraphService | null;
    });
    run(query: string, options?: {
        system?: string;
        memoryTopic?: string;
        isFollowUp?: boolean;
    }): Promise<string>;
}
//# sourceMappingURL=research-agent.d.ts.map