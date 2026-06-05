import { type CloudflareWorkersAIClient, type RequestClassification, type ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
export type AgentLoopConfig = {
    max_steps: number;
    replan_on_failure: boolean;
};
export type PlannerStep = {
    think?: string;
    action: "continue" | "finish" | "blocked" | "ask_user";
    tool?: string;
    payload?: unknown;
    summary?: string;
    final?: string;
    question?: string;
};
export declare class AgentPlanner {
    private readonly cf;
    private readonly executor;
    private readonly registry;
    private readonly workspaceRoot;
    private loopConfig;
    constructor(cf: CloudflareWorkersAIClient, executor: ToolExecutor, registry: ToolRegistry, workspaceRoot: string);
    run(goal: string, ctx: ToolContext, options?: {
        classification?: RequestClassification;
        hint?: string;
    }): Promise<string>;
    private buildPlannerPrompt;
    private loadLoopConfig;
}
export declare function parsePlannerStep(raw: string): PlannerStep | null;
//# sourceMappingURL=agent-planner.d.ts.map