import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

const stepSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.record(z.unknown()).optional(),
});

const workflowSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  inputs: z.record(z.unknown()).optional(),
  steps: z.array(stepSchema),
});

export type WorkflowDefinition = z.infer<typeof workflowSchema>;

export class WorkflowRegistry {
  private readonly workflows = new Map<string, WorkflowDefinition>();

  register(def: WorkflowDefinition): void {
    this.workflows.set(def.id, workflowSchema.parse(def));
  }

  loadFromDir(dir: string): void {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
      const raw = parse(readFileSync(resolve(dir, file), "utf8")) as WorkflowDefinition;
      this.register(raw);
    }
  }

  get(id: string): WorkflowDefinition | null {
    return this.workflows.get(id) ?? null;
  }

  list(): string[] {
    return [...this.workflows.keys()];
  }
}

export type WorkflowContext = {
  inputs: Record<string, unknown>;
  vars: Record<string, unknown>;
};

export type WorkflowRunner = {
  invokeTool: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
};

export class WorkflowEngine {
  constructor(private readonly registry: WorkflowRegistry) {}

  async run(
    workflowId: string,
    runner: WorkflowRunner,
    inputs: Record<string, unknown> = {},
  ): Promise<{ outputs: Record<string, unknown>; trace: string[] }> {
    const def = this.registry.get(workflowId);
    if (!def) throw new Error(`Unknown workflow: ${workflowId}`);

    const ctx: WorkflowContext = { inputs: { ...def.inputs, ...inputs }, vars: {} };
    const trace: string[] = [];

    for (const step of def.steps) {
      const args = this.resolveStepArgs(step, ctx);
      const result = await runner.invokeTool(step.tool, args);
      ctx.vars[step.id] = result;
      trace.push(`${step.id}: ${step.tool} ok`);
    }

    return { outputs: ctx.vars, trace };
  }

  private resolveStepArgs(
    step: { tool: string; args?: Record<string, unknown> },
    ctx: WorkflowContext,
  ): Record<string, unknown> {
    const args: Record<string, unknown> = { ...(step.args ?? {}), ...ctx.inputs };
    if (step.tool === "gmail.summarize_threads" && ctx.vars.search) {
      const search = ctx.vars.search as { emails?: Array<{ threadId?: string }> };
      args.threadIds = [
        ...new Set(search.emails?.map((e) => e.threadId).filter(Boolean) ?? []),
      ];
    }
    return args;
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createDefaultWorkflowRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();
  registry.register({
    id: "gmail.check_inbox",
    description: "Search, summarize, extract open loops",
    inputs: { accountId: "default", query: "newer_than:3d" },
    steps: [
      { id: "search", tool: "gmail.search", args: { query: "newer_than:3d" } },
      { id: "summarize", tool: "gmail.summarize_threads" },
      { id: "loops", tool: "gmail.extract_open_loops" },
    ],
  });
  try {
    registry.loadFromDir(resolve(__dirname, "workflows"));
  } catch {
    /* optional yaml dir */
  }
  return registry;
}
