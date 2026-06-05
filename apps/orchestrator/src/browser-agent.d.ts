import type { CloudflareWorkersAIClient, IntentEntities, ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
/** Browser tasks use Mac screen + open URL; headless fetch is fallback only. */
export declare class BrowserAgent {
    private readonly laptop;
    constructor(executor: ToolExecutor, cf: CloudflareWorkersAIClient | null, workspaceRoot: string);
    private readonly executor;
    private readonly cf;
    run(text: string, entities: IntentEntities | undefined, ctx: ToolContext): Promise<string>;
    private headlessFetch;
}
//# sourceMappingURL=browser-agent.d.ts.map