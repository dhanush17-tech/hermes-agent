import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  withAssistantPolicy,
  type CloudflareWorkersAIClient,
  type RequestClassification,
  type ToolContext,
} from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolRegistry } from "@hermes-os/tool-executor";

export type AgentLoopConfig = {
  max_steps: number;
  replan_on_failure: boolean;
};

export type PlannerStep = {
  think?: string;
  action: "continue" | "finish" | "blocked" | "ask_user";
  tool?: string;
  payload?: unknown;
  summary?: string;
  final?: string;
  question?: string;
};

const DEFAULT_LOOP: AgentLoopConfig = { max_steps: 8, replan_on_failure: true };

export class AgentPlanner {
  private loopConfig: AgentLoopConfig | null = null;

  constructor(
    private readonly cf: CloudflareWorkersAIClient,
    private readonly executor: ToolExecutor,
    private readonly registry: ToolRegistry,
    private readonly workspaceRoot: string,
  ) {}

  async run(
    goal: string,
    ctx: ToolContext,
    options?: {
      classification?: RequestClassification;
      hint?: string;
    },
  ): Promise<string> {
    const config = await this.loadLoopConfig();
    const catalog = this.registry.listNames().join(", ");
    const macros = this.registry.has("tools.run") ? "Macros: custom.* via tools.run" : "";
    const trace: string[] = [];
    let lastError: string | null = null;

    for (let step = 0; step < config.max_steps; step++) {
      const prompt = this.buildPlannerPrompt(goal, trace, lastError, catalog, macros, options?.hint);
      const raw = await this.cf.chat(prompt, {
        classification: options?.classification ?? "unknown",
        maxTokens: 700,
        system: withAssistantPolicy(
          [
            "You are the Hermes agent planner. Think step-by-step, then either call ONE tool or finish.",
            "Respond with ONLY valid JSON (no markdown):",
            '{"think":"reasoning","action":"continue|finish","tool":"tool.name","payload":{},"summary":"short label","final":"answer when finish"}',
            "On finish set action to finish and include final — include https links when user asked to buy or get links.",
            "On continue you must set tool + payload. Never finish with 'cannot browse' — use browser.open or web.fetch.",
            "Prefer browser.open + browser.observe with element refs over screen.observe/screenshots.",
            "Use browser.click/browser.fill with refs — not x/y coordinates.",
            "Use code.self_edit for repo changes, tools.author for macros, browser.open for web URLs.",
          ].join("\n"),
        ),
      });

      const parsed = parsePlannerStep(raw);
      if (!parsed) {
        lastError = "invalid planner JSON";
        trace.push(`step ${step + 1}: planner returned invalid JSON`);
        continue;
      }

      if (parsed.think) trace.push(`think: ${parsed.think}`);

      if (parsed.action === "finish") {
        const lines = ["## Done", parsed.final ?? parsed.think ?? "Task complete.", "", "### Trace", ...trace];
        return lines.join("\n");
      }

      const tool = parsed.tool?.trim();
      if (!tool || !this.registry.has(tool)) {
        lastError = `unknown tool: ${tool ?? "(missing)"}`;
        trace.push(`step ${step + 1}: ${lastError}`);
        if (!config.replan_on_failure) break;
        continue;
      }

      const result = await this.executor.invoke(tool, parsed.payload ?? {}, ctx, {
        summary: parsed.summary ?? `${tool} for: ${goal.slice(0, 80)}`,
        terminalCommand:
          tool === "terminal.run" ?
            (parsed.payload as { command?: string })?.command
          : undefined,
      });

      if (result.status === "pending_approval") {
        trace.push(`approval required before ${tool}`);
        return [result.message, "", "### Trace so far", ...trace].join("\n");
      }
      if (result.status === "denied") {
        lastError = result.reason;
        trace.push(`${tool}: denied — ${result.reason}`);
        if (!config.replan_on_failure) {
          return [`Stopped at ${tool}: ${result.reason}`, "", "### Trace", ...trace].join("\n");
        }
        continue;
      }

      trace.push(`${tool}: ok — ${JSON.stringify(result.data).slice(0, 500)}`);
      lastError = null;
    }

    return [
      `Reached max steps (${config.max_steps}). Partial progress:`,
      "",
      "### Trace",
      ...trace,
    ].join("\n");
  }

  private buildPlannerPrompt(
    goal: string,
    trace: string[],
    lastError: string | null,
    catalog: string,
    macros: string,
    hint?: string,
  ): string {
    return [
      `Goal: ${goal}`,
      hint ? `Hint: ${hint}` : "",
      `Tools: ${catalog}`,
      macros,
      lastError ? `Last error: ${lastError}` : "",
      "Prior steps:",
      trace.length ? trace.join("\n") : "(none)",
      "What is the next single tool call, or finish?",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async loadLoopConfig(): Promise<AgentLoopConfig> {
    if (this.loopConfig) return this.loopConfig;
    try {
      const raw = await readFile(resolve(this.workspaceRoot, "configs/agent-loop.yaml"), "utf8");
      const data = parseYaml(raw) as AgentLoopConfig;
      this.loopConfig = {
        max_steps: data.max_steps ?? DEFAULT_LOOP.max_steps,
        replan_on_failure: data.replan_on_failure ?? true,
      };
    } catch {
      this.loopConfig = DEFAULT_LOOP;
    }
    return this.loopConfig;
  }
}

export function parsePlannerStep(raw: string): PlannerStep | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced?.[1]?.trim() ?? extractJson(raw);
  if (!jsonText) return null;
  try {
    const data = JSON.parse(jsonText) as Record<string, unknown>;
    const action =
      data.action === "finish" ? "finish"
      : data.action === "blocked" || data.action === "ask_user" ? data.action
      : "continue";
    return {
      think: typeof data.think === "string" ? data.think : undefined,
      action,
      tool: typeof data.tool === "string" ? data.tool : undefined,
      payload: data.payload,
      summary: typeof data.summary === "string" ? data.summary : undefined,
      final: typeof data.final === "string" ? data.final : undefined,
    };
  } catch {
    return null;
  }
}

function extractJson(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}
