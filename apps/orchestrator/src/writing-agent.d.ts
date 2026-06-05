import type { CloudflareWorkersAIClient, IntentEntities, ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
export declare class WritingAgent {
    private readonly cf;
    private readonly executor;
    constructor(cf: CloudflareWorkersAIClient | null, executor: ToolExecutor);
    run(text: string, entities: IntentEntities | undefined, ctx: ToolContext, options?: {
        send?: boolean;
    }): Promise<string>;
}
//# sourceMappingURL=writing-agent.d.ts.map