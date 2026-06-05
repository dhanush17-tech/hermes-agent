import { ResearchEngine } from "@hermes-os/research";
export class ResearchAgent {
    engine;
    constructor(cf, memory, options) {
        this.engine = new ResearchEngine({
            cf,
            memory,
            workspaceRoot: options?.workspaceRoot ?? process.cwd(),
            contextGraph: options?.contextGraph ?? null,
        });
    }
    async run(query, options) {
        return this.engine.run(query, options);
    }
}
//# sourceMappingURL=research-agent.js.map