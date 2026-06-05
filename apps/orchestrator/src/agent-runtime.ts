import type { CloudflareWorkersAIClient, HermesModelProvider } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
import type {
  AssistantStateRepository,
  OpenLoopsRepository,
  RisksRepository,
  SourceItemsRepository,
  TasksRepository,
} from "@hermes-os/context-graph";
import type { ContextGraphService } from "@hermes-os/context-graph";
import type { ConnectorHub } from "@hermes-os/connectors";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { ProactivityPolicy } from "@hermes-os/policies";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";
import {
  CloudflareRuntime,
  HermesGatewayRuntime,
  RuntimeRouter,
  buildToolCatalog,
  type AgentRuntime as CognitiveAgentRuntime,
  type ToolDescription,
} from "@hermes-os/agent-runtime";
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

export type AgentRuntime = {
  cognitive: {
    hermes: CognitiveAgentRuntime;
    cloudflare: CognitiveAgentRuntime;
    router: RuntimeRouter;
    toolCatalog: ToolDescription[];
  };
  research: ResearchAgent | null;
  memory: MemoryAgent;
  chiefOfStaff: ChiefOfStaffAgent;
  risk: RiskPredictionAgent;
  autonomous: AutonomousAgent | null;
  presence: DigitalPresenceMonitor;
  coding: CodingAgent;
  browser: BrowserAgent;
  laptop: LaptopControlAgent;
  writing: WritingAgent;
  general: GeneralAgent;
  hermes: HermesModelProvider | null;
  cloudflare: CloudflareWorkersAIClient | null;
};

export function createAgentRuntime(deps: {
  cloudflare: CloudflareWorkersAIClient | null;
  hermes: HermesModelProvider | null;
  memory: MemoryService;
  executor: ToolExecutor;
  registry: ToolRegistry;
  workspaceRoot: string;
  tasks: TasksRepository;
  openLoops: OpenLoopsRepository;
  sourceItems: SourceItemsRepository;
  risks: RisksRepository;
  stateRepo: AssistantStateRepository;
  proactivity: ProactivityPolicy;
  connectorHub: ConnectorHub | null;
  contextGraph?: ContextGraphService;
  audit: AuditLogger;
  activity: ActivityMonitor;
}): AgentRuntime {
  const cf = deps.cloudflare;
  const hermesRuntime = new HermesGatewayRuntime(deps.hermes);
  const cloudflareRuntime = new CloudflareRuntime(cf);
  return {
    cognitive: {
      hermes: hermesRuntime,
      cloudflare: cloudflareRuntime,
      router: new RuntimeRouter({ hermes: hermesRuntime, cloudflare: cloudflareRuntime }),
      toolCatalog: buildToolCatalog(deps.registry.listNames().filter((name) => name !== "terminal.run")),
    },
    cloudflare: cf,
    hermes: deps.hermes,
    research:
      cf ?
        new ResearchAgent(cf, deps.memory, {
          workspaceRoot: deps.workspaceRoot,
          contextGraph: deps.contextGraph ?? null,
        })
      : null,
    memory: new MemoryAgent(deps.memory, cf),
    chiefOfStaff: new ChiefOfStaffAgent(
      deps.tasks,
      deps.openLoops,
      deps.sourceItems,
      deps.risks,
      deps.stateRepo,
      deps.proactivity,
      deps.connectorHub,
      cf,
      deps.contextGraph ?? null,
    ),
    risk: new RiskPredictionAgent(
      deps.sourceItems,
      deps.openLoops,
      deps.tasks,
      deps.risks,
      deps.audit,
    ),
    autonomous:
      cf ?
        new AutonomousAgent(cf, deps.executor, deps.registry, deps.workspaceRoot, deps.activity)
      : null,
    presence: new DigitalPresenceMonitor(
      deps.executor,
      deps.sourceItems,
      deps.openLoops,
      cf,
      deps.activity,
    ),
    coding: new CodingAgent(
      deps.hermes,
      cf,
      deps.executor,
      deps.registry,
      deps.workspaceRoot,
      deps.activity,
    ),
    browser: new BrowserAgent(deps.executor, cf, deps.workspaceRoot),
    laptop: new LaptopControlAgent(deps.executor, cf, deps.workspaceRoot),
    writing: new WritingAgent(cf, deps.executor),
    general: new GeneralAgent(
      cf,
      deps.memory,
      deps.executor,
      deps.registry,
      deps.workspaceRoot,
      deps.activity,
    ),
  };
}
