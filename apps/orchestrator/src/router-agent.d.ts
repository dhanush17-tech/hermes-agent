import type { ClassifiedIntent, IntentClassifierContext, IntentClassifierPort } from "@hermes-os/shared";
export declare class RouterAgent {
    private readonly classifier;
    constructor(classifier: IntentClassifierPort | null);
    classify(text: string, ctx?: IntentClassifierContext): Promise<ClassifiedIntent>;
}
//# sourceMappingURL=router-agent.d.ts.map