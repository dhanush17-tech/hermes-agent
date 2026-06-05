import type { CloudflareWorkersAIClient, IntentEntities } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
export declare class MemoryAgent {
    private readonly memory;
    private readonly cf;
    constructor(memory: MemoryService, cf: CloudflareWorkersAIClient | null);
    handle(userMessage: string, entities?: IntentEntities): Promise<string>;
    private inferMemoryType;
}
//# sourceMappingURL=memory-agent.d.ts.map