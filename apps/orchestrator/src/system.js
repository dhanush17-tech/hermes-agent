import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { createDb, runMigrations, ApprovalsRepository, CapabilityLeasesRepository, AuditRepository, AssistantStateRepository, MemoriesRepository, TasksRepository, OpenLoopsRepository, SourceItemsRepository, RisksRepository, createContextGraphService, } from "@hermes-os/context-graph";
import { AuditLogger, ActivityMonitor } from "@hermes-os/audit-log";
import { ApprovalBroker } from "@hermes-os/approval-broker";
import { PolicyEngine, loadRiskPolicy, loadProactivityPolicy } from "@hermes-os/policies";
import { ToolExecutor, createToolRegistry } from "@hermes-os/tool-executor";
import { createCloudflareClientFromEnv, createHermesClientFromEnv, findWorkspaceRoot, IntentClassifier, } from "@hermes-os/shared";
import { createHybridMemoryService, loadMemoryPolicy, } from "@hermes-os/memory";
import { createDefaultConnectorHub } from "@hermes-os/connectors";
import { Orchestrator } from "./orchestrator.js";
import { createAgentRuntime } from "./agent-runtime.js";
import { HindranceCoordinator } from "./hindrance-coordinator.js";
export function bootstrapPersonalOs(options) {
    let workspaceRoot = options?.workspaceRoot ?? findWorkspaceRoot();
    try {
        loadEnvFile(resolve(workspaceRoot, ".env"));
    }
    catch {
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
    const risksRepo = new RisksRepository(db);
    const contextGraph = createContextGraphService(db);
    const audit = new AuditLogger(auditRepo);
    const activity = new ActivityMonitor(audit, { workspaceRoot });
    activity.attachToAuditLogger(audit);
    const hindrance = new HindranceCoordinator(workspaceRoot, activity);
    const connectorHub = createDefaultConnectorHub(sourceItemsRepo, workspaceRoot);
    const ttl = Number(process.env.APPROVAL_TTL_SECONDS ?? options?.approvalTtlSeconds ?? 300);
    const broker = new ApprovalBroker(approvalsRepo, capabilityLeasesRepo, audit, ttl, options?.now);
    const policy = new PolicyEngine(loadRiskPolicy(resolve(workspaceRoot, "configs/risk-policy.yaml")));
    const memoryService = createHybridMemoryService(memoriesRepo, loadMemoryPolicy(), "default-user");
    const hermes = createHermesClientFromEnv();
    const cloudflare = createCloudflareClientFromEnv();
    const executorRef = { current: null };
    const { registry, macros } = createToolRegistry({
        workspaceRoot,
        memory: memoryService,
        hermes,
        cf: cloudflare,
        executorRef,
    });
    macros.loadFromDiskSync();
    const executor = new ToolExecutor(policy, broker, audit, registry);
    executorRef.current = executor;
    const intentClassifier = options?.intentClassifier ??
        (cloudflare ? new IntentClassifier(cloudflare) : null);
    const agents = createAgentRuntime({
        cloudflare,
        hermes,
        memory: memoryService,
        executor,
        registry,
        workspaceRoot,
        tasks: tasksRepo,
        openLoops: openLoopsRepo,
        sourceItems: sourceItemsRepo,
        risks: risksRepo,
        stateRepo,
        proactivity: loadProactivityPolicy(),
        connectorHub,
        contextGraph,
        audit,
        activity,
    });
    const orchestrator = new Orchestrator(broker, executor, registry, audit, activity, hindrance, auditRepo, stateRepo, tasksRepo, openLoopsRepo, workspaceRoot, agents, memoryService, intentClassifier, contextGraph);
    return {
        orchestrator,
        broker,
        executor,
        memory: memoryService,
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
export function createProactiveServices(workspaceRoot) {
    const { db, sqlite } = createDb();
    runMigrations(sqlite);
    const sourceItems = new SourceItemsRepository(db);
    const stateRepo = new AssistantStateRepository(db);
    const audit = new AuditLogger(new AuditRepository(db));
    const policy = loadProactivityPolicy();
    return {
        audit,
        sourceItems,
        stateRepo,
        policy,
        connectorHub: createDefaultConnectorHub(sourceItems, workspaceRoot),
    };
}
//# sourceMappingURL=system.js.map