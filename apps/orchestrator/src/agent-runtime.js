import { ResearchAgent } from "./research-agent.js";
import { MemoryAgent } from "./memory-agent.js";
import { ChiefOfStaffAgent } from "./chief-of-staff-agent.js";
import { RiskPredictionAgent } from "./risk-prediction-agent.js";
import { CodingAgent } from "./coding-agent.js";
import { BrowserAgent } from "./browser-agent.js";
import { LaptopControlAgent } from "./laptop-control-agent.js";
import { WritingAgent } from "./writing-agent.js";
import { GeneralAgent } from "./general-agent.js";
import { AutonomousAgent } from "./autonomous-agent.js";
import { DigitalPresenceMonitor } from "./digital-presence-monitor.js";
export function createAgentRuntime(deps) {
    const cf = deps.cloudflare;
    return {
        cloudflare: cf,
        hermes: deps.hermes,
        research: cf ?
            new ResearchAgent(cf, deps.memory, {
                workspaceRoot: deps.workspaceRoot,
                contextGraph: deps.contextGraph ?? null,
            })
            : null,
        memory: new MemoryAgent(deps.memory, cf),
        chiefOfStaff: new ChiefOfStaffAgent(deps.tasks, deps.openLoops, deps.sourceItems, deps.risks, deps.stateRepo, deps.proactivity, deps.connectorHub, cf, deps.contextGraph ?? null),
        risk: new RiskPredictionAgent(deps.sourceItems, deps.openLoops, deps.tasks, deps.risks, deps.audit),
        autonomous: cf ?
            new AutonomousAgent(cf, deps.executor, deps.registry, deps.workspaceRoot, deps.activity)
            : null,
        presence: new DigitalPresenceMonitor(deps.executor, deps.sourceItems, deps.openLoops, cf, deps.activity),
        coding: new CodingAgent(deps.hermes, cf, deps.executor, deps.registry, deps.workspaceRoot, deps.activity),
        browser: new BrowserAgent(deps.executor, cf, deps.workspaceRoot),
        laptop: new LaptopControlAgent(deps.executor, cf, deps.workspaceRoot),
        writing: new WritingAgent(cf, deps.executor),
        general: new GeneralAgent(cf, deps.memory, deps.executor, deps.registry, deps.workspaceRoot, deps.activity),
    };
}
//# sourceMappingURL=agent-runtime.js.map