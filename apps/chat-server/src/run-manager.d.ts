import type { Orchestrator } from "@hermes-os/orchestrator";
export type ServerEvent = {
    type: "run_started";
    runId: string;
    goal: string;
    parallel?: boolean;
} | {
    type: "run_finished";
    runId: string;
} | {
    type: "steering_applied";
    runId: string;
    message: string;
} | {
    type: "parallel_task";
    runId: string;
    goal: string;
} | {
    type: "interrupted";
    runId: string;
    reason: string;
} | {
    type: "reply";
    runId: string;
    text: string;
} | {
    type: "error";
    runId: string;
    message: string;
} | {
    type: "status";
    running: boolean;
    runId: string | null;
    goal: string | null;
    parallelTasks: number;
};
/**
 * Single chat session: one message at a time, shared conversation history in the orchestrator.
 * A new message cancels any in-flight reply so follow-ups stay in the same thread.
 */
export declare class ChatRunManager {
    private readonly orchestrator;
    private readonly emit;
    private activeRunId;
    private activeController;
    private activePromise;
    constructor(orchestrator: Orchestrator, emit: (event: ServerEvent) => void);
    getStatus(): ServerEvent & {
        type: "status";
    };
    submit(text: string): Promise<{
        runId: string;
        steering: boolean;
        related: boolean;
        parallel: boolean;
    }>;
    interrupt(): Promise<boolean>;
    private runOnce;
}
//# sourceMappingURL=run-manager.d.ts.map