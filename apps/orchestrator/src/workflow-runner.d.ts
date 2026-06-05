import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolContext } from "@hermes-os/shared";
import { WorkflowEngine } from "@hermes-os/workflows";
export declare function getWorkflowEngine(): WorkflowEngine;
export declare function runWorkflow(workflowId: string, executor: ToolExecutor, ctx: ToolContext, inputs?: Record<string, unknown>): Promise<{
    outputs: Record<string, unknown>;
    trace: string[];
    failed?: string;
}>;
export declare function formatGmailWorkflowReply(outputs: Record<string, unknown>, accountEmail: string): string;
//# sourceMappingURL=workflow-runner.d.ts.map