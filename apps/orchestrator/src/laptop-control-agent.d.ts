import type { CloudflareWorkersAIClient, IntentEntities, ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
export declare class LaptopControlAgent {
    private readonly executor;
    private readonly cf;
    private readonly sessions;
    constructor(executor: ToolExecutor, cf: CloudflareWorkersAIClient | null, workspaceRoot: string);
    /** Resume after user sends credentials (orchestrator calls before intent routing). */
    tryHandleCredentialReply(text: string, ctx: ToolContext): Promise<string | null>;
    run(text: string, entities: IntentEntities | undefined, ctx: ToolContext, options?: {
        preferCompose?: boolean;
        skipLoginPause?: boolean;
    }): Promise<string>;
    private inferServiceLabel;
    private resolveUrl;
    private invokeTool;
}
//# sourceMappingURL=laptop-control-agent.d.ts.map