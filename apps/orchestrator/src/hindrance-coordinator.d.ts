import type { ActivityMonitor, AgentName } from "@hermes-os/audit-log";
import { HindranceStore, type HindranceCategory, type ActiveHindrance } from "./hindrance-store.js";
export declare class HindranceCoordinator {
    private readonly activity;
    private readonly store;
    constructor(workspaceRoot: string, activity: ActivityMonitor);
    get storeRef(): HindranceStore;
    getActive(): Promise<ActiveHindrance | null>;
    /** Pause background work that would fail again; notify user once. */
    reportAndNotify(input: {
        category: HindranceCategory;
        issue: string;
        question: string;
        resolutionHint?: string;
        agent?: AgentName;
    }): Promise<boolean>;
    /** User replied while a hindrance is active — clear and acknowledge. */
    tryResumeFromUser(text: string): Promise<string | null>;
    /** Skip proactive/background tasks while waiting on user for same category. */
    shouldSkipBackgroundTask(category?: HindranceCategory): Promise<boolean>;
}
//# sourceMappingURL=hindrance-coordinator.d.ts.map