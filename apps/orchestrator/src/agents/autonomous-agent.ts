import {
  llmStructured,
  MODELS,
  AUTONOMOUS_STEP_SCHEMA,
  validateAutonomousStep,
  type AutonomousStep,
  type ChatMessage,
  type MemoryCandidate,
} from "@hermes-os/llm-client";
import { generateId, type ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { BlockedSessionStore } from "../blocked-session-store.js";

const AUTONOMOUS_SYSTEM_PROMPT = `You are Hermes's autonomous operator. You control the laptop directly to complete tasks.

You think step-by-step and execute one tool at a time.

ACTIONS:
- "continue": You have a clear next step. Set tool and payload.
- "finish": Task is complete. Set final to the result or summary.
- "need_user": You are GENUINELY BLOCKED — login wall, CAPTCHA, ambiguous credentials,
  explicit permission required, destructive action needs confirmation.
  Ask ONE specific yes/no or multiple-choice question in question.
  Do NOT use need_user to hedge or seek reassurance on obvious steps.

TOOL PREFERENCE:
1. connector APIs (gmail.*, calendar.*) over browser
2. browser CDP tools (browser.observe → browser.click/fill by el_ref) over screenshots
3. desktop AX tree (desktop.observe_app → desktop.act by ax_ref) for native apps
4. screen.observe ONLY when AX tree unavailable (non-accessible apps)

BROWSER RULES:
- Always call browser.observe first to get el_refs
- Reference elements by el_ref, never by position, text, or index

DESKTOP RULES:
- desktop.observe_app returns ax_refs for every interactive element
- Never click a UI element without observing first

RECOVERY:
- If a step fails, try an alternate tool path before using need_user
- If you've tried 2 paths and both fail → need_user with specific error context

MEMORY: Include memoryCandidates for durable facts discovered during execution.`;

export type AutonomousAgentResult = {
  response: string;
  memoryCandidates: MemoryCandidate[];
};

export class AutonomousAgentV2 {
  private readonly blockedStore: BlockedSessionStore;

  constructor(
    private readonly executor: ToolExecutor,
    private readonly workspaceRoot: string,
  ) {
    this.blockedStore = new BlockedSessionStore(workspaceRoot);
  }

  async tryHandleUserGuidance(text: string, ctx: ToolContext): Promise<AutonomousAgentResult | null> {
    const session = await this.blockedStore.get();
    if (!session) return null;
    await this.blockedStore.clear();
    return this.run(session.goal, ctx, {
      systemBlock: `Prior blocked session. User guidance: ${text.trim()}\nPrior trace:\n${session.trace.join("\n")}`,
    });
  }

  async run(
    goal: string,
    ctx: ToolContext,
    opts: { systemBlock?: string } = {},
  ): Promise<AutonomousAgentResult> {
    const systemPrompt = [AUTONOMOUS_SYSTEM_PROMPT, opts.systemBlock ?? ""].filter(Boolean).join("\n\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: goal },
    ];

    const allMemoryCandidates: MemoryCandidate[] = [];
    let steps = 0;
    const MAX_STEPS = 18;

    while (steps < MAX_STEPS) {
      steps++;

      const step = await llmStructured<AutonomousStep>({
        model: MODELS.PRIMARY,
        schemaName: "autonomous_step",
        schema: AUTONOMOUS_STEP_SCHEMA,
        messages,
        temperature: 0.2,
        max_tokens: 1024,
        validate: validateAutonomousStep,
      });

      if (step.memoryCandidates?.length) {
        allMemoryCandidates.push(...step.memoryCandidates);
      }

      if (step.action === "finish") {
        return { response: step.final ?? "Done.", memoryCandidates: allMemoryCandidates };
      }

      if (step.action === "need_user") {
        await this.blockedStore.save({
          id: generateId("blocked"),
          goal,
          question: step.question ?? "I need your input to continue.",
          trace: messages.map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[multimodal]"}`),
          createdAt: new Date().toISOString(),
        });
        return {
          response: step.question ?? "I need your input to continue.",
          memoryCandidates: allMemoryCandidates,
        };
      }

      if (!step.tool) {
        throw new Error("action=continue but no tool specified");
      }

      const toolResult = await this.executor.invoke(step.tool, step.payload ?? {}, ctx, {
        summary: step.summary,
      });

      if (toolResult.status === "pending_approval") {
        return { response: toolResult.message, memoryCandidates: allMemoryCandidates };
      }

      messages.push(
        { role: "assistant", content: JSON.stringify(step) },
        { role: "user", content: `Tool result (${step.tool}): ${JSON.stringify(toolResult)}` },
      );
    }

    return {
      response: `I completed ${MAX_STEPS} steps. Task may not be fully done — let me know if you want me to continue.`,
      memoryCandidates: allMemoryCandidates,
    };
  }
}
