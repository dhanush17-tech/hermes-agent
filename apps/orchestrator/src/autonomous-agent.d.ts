import { type CloudflareWorkersAIClient, type RequestClassification, type SteerController, type ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import { type PlannerStep } from "./agent-planner.js";
export type AgentLoopConfig = {
    max_steps: number;
    replan_on_failure: boolean;
    auto_observe_after_browser: boolean;
    allow_self_edit_when_stuck: boolean;
};
/**
 * Think → act → observe → replan (including code.self_edit) → ask user only when blocked.
 */
export declare class AutonomousAgent {
    private readonly cf;
    private readonly executor;
    private readonly registry;
    private readonly workspaceRoot;
    private readonly activity;
    private loopConfig;
    private readonly blockedStore;
    constructor(cf: CloudflareWorkersAIClient, executor: ToolExecutor, registry: ToolRegistry, workspaceRoot: string, activity: ActivityMonitor);
    tryHandleUserGuidance(text: string, ctx: ToolContext): Promise<string | null>;
    run(goal: string, ctx: ToolContext, options?: {
        classification?: RequestClassification;
        hint?: string;
        resumeFromBlocked?: boolean;
        signal?: AbortSignal;
        steerController?: SteerController;
    }): Promise<string>;
    private tryImplementFix;
    private blockAndAskUser;
    private plannerSystemPrompt;
    private buildPlannerPrompt;
    private inferServiceFromGoal;
    private loadLoopConfig;
}
export declare function parsePlannerStepExtended(raw: string): PlannerStep | null;
//# sourceMappingURL=autonomous-agent.d.ts.map