import { type CloudflareWorkersAIClient, type HermesModelProvider, type ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
export declare class CodingAgent {
    private readonly hermes;
    private readonly cf;
    private readonly executor;
    private readonly registry;
    private readonly workspaceRoot;
    private readonly activity;
    constructor(hermes: HermesModelProvider | null, cf: CloudflareWorkersAIClient | null, executor: ToolExecutor | null, registry: ToolRegistry | null, workspaceRoot: string, activity: ActivityMonitor);
    run(instruction: string, ctx?: ToolContext): Promise<string>;
}
//# sourceMappingURL=coding-agent.d.ts.map