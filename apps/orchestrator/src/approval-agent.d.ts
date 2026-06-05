import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { IntentEntities, ToolContext } from "@hermes-os/shared";
export declare class ApprovalAgent {
    private readonly broker;
    private readonly executor;
    constructor(broker: ApprovalBroker, executor: ToolExecutor);
    handleIntent(entities: IntentEntities | undefined, ctx: ToolContext): Promise<{
        reply: string;
        executed?: boolean;
    }>;
}
//# sourceMappingURL=approval-agent.d.ts.map