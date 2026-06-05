import type { CloudflareWorkersAIClient, ToolContext } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
export declare class GeneralAgent {
    private readonly cf;
    private readonly memory;
    private readonly executor;
    private readonly registry;
    private readonly workspaceRoot;
    private readonly activity;
    constructor(cf: CloudflareWorkersAIClient | null, memory: MemoryService, executor: ToolExecutor | null, registry: ToolRegistry | null, workspaceRoot: string, activity: ActivityMonitor);
    run(message: string, ctx?: ToolContext): Promise<string>;
    /** iMessage / chat — non-reasoning model + retry if model leaks CoT. */
    private messagingChat;
}
//# sourceMappingURL=general-agent.d.ts.map