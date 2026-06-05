import type { CloudflareWorkersAIClient } from "../cloudflare/cloudflare-workers-ai.js";
import type { IntentCatalog } from "./types.js";
import type { ClassifiedIntent } from "./types.js";
export type IntentClassifierContext = {
    activeResearchTopic?: string | null;
    pendingApprovalIds?: string[];
    assistantState?: "running" | "paused" | "emergency_stop";
};
export type IntentClassifierPort = Pick<IntentClassifier, "classify">;
export declare class IntentClassifier {
    private readonly cf;
    private readonly catalog;
    constructor(cf: CloudflareWorkersAIClient, catalog?: IntentCatalog);
    classify(text: string, ctx?: IntentClassifierContext): Promise<ClassifiedIntent>;
    private applySessionBias;
    private buildSystemPrompt;
}
export declare function fallbackIntent(reason: string): ClassifiedIntent;
//# sourceMappingURL=intent-classifier.d.ts.map