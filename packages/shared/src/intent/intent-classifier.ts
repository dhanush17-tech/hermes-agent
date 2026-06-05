import { withAssistantPolicy } from "../assistant-policy.js";
import type { CloudflareWorkersAIClient } from "../cloudflare/cloudflare-workers-ai.js";
import type { RequestClassification } from "../types.js";
import { formatIntentCatalogForPrompt, loadIntentCatalog } from "./intent-catalog.js";
import type { IntentCatalog } from "./types.js";
import { parseIntentJson } from "./parse-intent-json.js";
import type { ClassifiedIntent } from "./types.js";

export type IntentClassifierContext = {
  activeResearchTopic?: string | null;
  pendingApprovalIds?: string[];
  assistantState?: "running" | "paused" | "emergency_stop";
};

export type IntentClassifierPort = Pick<IntentClassifier, "classify">;

export class IntentClassifier {
  private readonly catalog: IntentCatalog;

  constructor(
    private readonly cf: CloudflareWorkersAIClient,
    catalog?: IntentCatalog,
  ) {
    this.catalog = catalog ?? loadIntentCatalog();
  }

  async classify(text: string, ctx: IntentClassifierContext = {}): Promise<ClassifiedIntent> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { intent: "unknown", confidence: 0, reasoning: "Empty message" };
    }

    const system = this.buildSystemPrompt(ctx);
    const raw = await this.cf.chat(trimmed, {
      model: this.catalog.classifier_model,
      maxTokens: 400,
      system,
    });

    const parsed = parseIntentJson(raw);
    if (parsed) {
      return this.applySessionBias(parsed, ctx);
    }

    return {
      intent: "unknown",
      confidence: 0.2,
      reasoning: "Classifier returned invalid JSON",
    };
  }

  private applySessionBias(
    result: ClassifiedIntent,
    ctx: IntentClassifierContext,
  ): ClassifiedIntent {
    if (ctx.activeResearchTopic) {
      const continueResearch =
        result.intent === "research" ||
        result.entities?.researchContinue === true ||
        (result.intent === "unknown" && result.confidence < 0.85) ||
        result.intent === "browser_task";

      if (continueResearch && result.intent !== "approval_response") {
        return {
          ...result,
          intent: "research",
          confidence: Math.max(result.confidence, 0.7),
          entities: { ...result.entities, researchContinue: true },
          reasoning: `${result.reasoning ?? ""} (active research session)`.trim(),
        };
      }
    }
    return result;
  }

  private buildSystemPrompt(ctx: IntentClassifierContext): string {
    const pending =
      ctx.pendingApprovalIds?.length ?
        `Pending approval ids: ${ctx.pendingApprovalIds.join(", ")}`
      : "Pending approval ids: none";
    const research = ctx.activeResearchTopic ?
      `Active research topic: ${ctx.activeResearchTopic}`
    : "Active research topic: none";

    return withAssistantPolicy([
      "You are an intent classifier for a personal assistant. Pick exactly one intent id from the catalog.",
      "Prefer research for shopping/links/best-product questions; prefer laptop_control for opening sites in Arc.",
      "Respond with ONLY valid JSON, no markdown prose:",
      '{"intent":"<id>","confidence":0.0-1.0,"reasoning":"brief","entities":{...}}',
      "",
      "Optional entities (omit keys you do not need):",
      '- approvalAction: "approve" | "deny" | "edit"',
      "- approvalId: string",
      "- criticalConfirmed: boolean (true when user says 'approve <id> execute' for critical actions)",
      "- editText: string",
      '- assistantControl: "status" | "pause" | "resume" | "emergency_stop"',
      "- researchContinue: boolean (true if user continues current research thread)",
      "- researchEnd: boolean (true if user wants to stop the current research thread)",
      '- toolName: "social.post" | "code.self_edit" | "imessage.send" | "screen.observe" | "browser.goto" | "terminal.run" | "filesystem.write" | "tools.author" | "tools.define" | "tools.run"',
      "- payloadText: main user content for the tool (tweet body, code instruction, message body)",
      "- url: http(s) URL to open in the default browser",
      "",
      "Routing rules:",
      "- Any Gmail, email, calendar, Slack, Notion, Amazon, X/Twitter, or other account/service → laptop_control (not personal_ops).",
      "- Do not assume an API or connector exists; laptop_control uses screen + browser only.",
      '- memoryAction: "remember" | "forget" | "search"',
      "- memoryId: id when forgetting a specific memory",
      "",
      "Catalog:",
      formatIntentCatalogForPrompt(this.catalog),
      "",
      `Assistant state: ${ctx.assistantState ?? "running"}`,
      pending,
      research,
    ].join("\n"));
  }
}

export function fallbackIntent(reason: string): ClassifiedIntent {
  return { intent: "unknown", confidence: 0, reasoning: reason };
}
