import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import {
  createDb,
  runMigrations,
  ApprovalsRepository,
  CapabilityLeasesRepository,
  AuditRepository,
  AssistantStateRepository,
  MemoriesRepository,
  TasksRepository,
  OpenLoopsRepository,
  SourceItemsRepository,
  createContextGraphService,
  type ContextGraphService,
} from "@hermes-os/context-graph";
import { AuditLogger, ActivityMonitor } from "@hermes-os/audit-log";
import { ApprovalBroker } from "@hermes-os/approval-broker";
import { PolicyEngine, loadRiskPolicy, loadProactivityPolicy } from "@hermes-os/policies";
import { ToolExecutor, createToolRegistry, createSkillRunner } from "@hermes-os/tool-executor";
import type { SkillRegistry, SkillRunner } from "@hermes-os/skills";
import { indexSkill } from "@hermes-os/skills";
import { findWorkspaceRoot } from "@hermes-os/shared";
import {
  createHybridMemoryService,
  loadMemoryPolicy,
  type HybridMemoryService,
} from "@hermes-os/memory";
import { createDefaultConnectorHub } from "@hermes-os/connectors";
import { Orchestrator } from "./orchestrator.js";
import { HindranceCoordinator } from "./hindrance-coordinator.js";

export type PersonalOsSystem = {
  orchestrator: Orchestrator;
  broker: ApprovalBroker;
  executor: ToolExecutor;
  memory: HybridMemoryService;
  skills: SkillRegistry;
  skillRunner: SkillRunner;
  dbPath: string;
  audit: AuditLogger;
  activity: ActivityMonitor;
  hindrance: HindranceCoordinator;
  auditRepo: AuditRepository;
  stateRepo: AssistantStateRepository;
  sourceItemsRepo: SourceItemsRepository;
  openLoopsRepo: OpenLoopsRepository;
  tasksRepo: TasksRepository;
  contextGraph: ContextGraphService;
};

export type ProactiveServices = {
  audit: AuditLogger;
  sourceItems: SourceItemsRepository;
  stateRepo: AssistantStateRepository;
  policy: ReturnType<typeof loadProactivityPolicy>;
  connectorHub: ReturnType<typeof createDefaultConnectorHub>;
};

export function bootstrapPersonalOs(options?: {
  databasePath?: string;
  workspaceRoot?: string;
  approvalTtlSeconds?: number;
  now?: () => Date;
}): PersonalOsSystem {
  let workspaceRoot = options?.workspaceRoot ?? findWorkspaceRoot();
  try {
    loadEnvFile(resolve(workspaceRoot, ".env"));
  } catch {
    // .env optional
  }
  if (process.env.HERMES_OS_ROOT) {
    workspaceRoot = resolve(process.env.HERMES_OS_ROOT);
  }
  process.env.HERMES_OS_ROOT = workspaceRoot;

  const { db, sqlite, filePath } = createDb(options?.databasePath);
  runMigrations(sqlite);

  const approvalsRepo = new ApprovalsRepository(db);
  const capabilityLeasesRepo = new CapabilityLeasesRepository(db);
  const auditRepo = new AuditRepository(db);
  const stateRepo = new AssistantStateRepository(db);
  const memoriesRepo = new MemoriesRepository(db);
  const tasksRepo = new TasksRepository(db);
  const openLoopsRepo = new OpenLoopsRepository(db);
  const sourceItemsRepo = new SourceItemsRepository(db);
  const contextGraph = createContextGraphService(db);
  const audit = new AuditLogger(auditRepo);
  const activity = new ActivityMonitor(audit, { workspaceRoot });
  activity.attachToAuditLogger(audit);
  const hindrance = new HindranceCoordinator(workspaceRoot, activity);
  createDefaultConnectorHub(sourceItemsRepo, workspaceRoot);

  const ttl = Number(process.env.APPROVAL_TTL_SECONDS ?? options?.approvalTtlSeconds ?? 300);
  const broker = new ApprovalBroker(approvalsRepo, capabilityLeasesRepo, audit, ttl, options?.now);
  const policy = new PolicyEngine(loadRiskPolicy(resolve(workspaceRoot, "configs/risk-policy.yaml")));
  const memoryService = createHybridMemoryService(memoriesRepo, loadMemoryPolicy(), "default-user");
  const executorRef: { current: ToolExecutor | null } = { current: null };
  const { registry, macros, skills } = createToolRegistry({
    workspaceRoot,
    memory: memoryService,
    executorRef,
  });
  macros.loadFromDiskSync();
  const executor = new ToolExecutor(policy, broker, audit, registry);
  executorRef.current = executor;
  const skillRunner = createSkillRunner(skills, executor, workspaceRoot);

  void Promise.all(skills.listActive().map((skill) => indexSkill(skill))).catch((err) => {
    console.warn("[skills] Startup indexing failed:", err instanceof Error ? err.message : err);
  });

  const orchestrator = new Orchestrator(
    broker,
    executor,
    audit,
    activity,
    auditRepo,
    stateRepo,
    workspaceRoot,
    memoryService,
    skillRunner,
    skills,
    hindrance,
  );

  return {
    orchestrator,
    broker,
    executor,
    memory: memoryService,
    skills,
    skillRunner,
    dbPath: filePath,
    audit,
    activity,
    hindrance,
    auditRepo,
    stateRepo,
    sourceItemsRepo,
    openLoopsRepo,
    tasksRepo,
    contextGraph,
  };
}

export function createProactiveServices(workspaceRoot: string): ProactiveServices {
  const { db, sqlite } = createDb();
  runMigrations(sqlite);
  const sourceItems = new SourceItemsRepository(db);
  const stateRepo = new AssistantStateRepository(db);
  const audit = new AuditLogger(new AuditRepository(db));
  const connectorHub = createDefaultConnectorHub(sourceItems, workspaceRoot);
  return {
    audit,
    sourceItems,
    stateRepo,
    policy: loadProactivityPolicy(),
    connectorHub,
  };
}
