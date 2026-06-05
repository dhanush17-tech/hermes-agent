import type { IntentEntities, RequestClassification } from "@hermes-os/shared";
export type ToolInvocation = {
    toolName: string;
    payload: unknown;
    summary: string;
    targetPath?: string;
    terminalCommand?: string;
};
export declare class OperatorAgent {
    plan(classification: RequestClassification, text: string, entities?: IntentEntities): ToolInvocation | null;
    private fromToolName;
}
//# sourceMappingURL=operator-agent.d.ts.map