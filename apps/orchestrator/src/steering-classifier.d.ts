import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
/**
 * True = new message should steer the active task (pause think, replan from current trace).
 * False = unrelated; active task continues, new message is a separate request.
 */
export declare function classifySteeringRelevance(activeGoal: string, newMessage: string, cf: CloudflareWorkersAIClient | null): Promise<boolean>;
//# sourceMappingURL=steering-classifier.d.ts.map