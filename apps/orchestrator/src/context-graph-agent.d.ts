import type { ContextGraphService } from "@hermes-os/context-graph";
export declare function isContextGraphQuery(text: string): boolean;
export declare class ContextGraphAgent {
    private readonly graph;
    constructor(graph: ContextGraphService);
    answer(text: string): Promise<string>;
}
//# sourceMappingURL=context-graph-agent.d.ts.map