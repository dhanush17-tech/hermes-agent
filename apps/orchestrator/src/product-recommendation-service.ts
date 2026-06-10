import type { ClassifiedIntent, ToolContext } from "@hermes-os/shared";
import { extractHttpsLinks } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import {
  ProductRecommendationWorkflow,
  parseProductIntent,
  parseClarificationReply,
  memoryStatementsFromPreferences,
  type ProductRecommendation,
  type ProductCandidate,
} from "@hermes-os/recommendations";
import {
  createResearchSession,
  handleStructuredFollowUp,
  hasValidStructuredRecommendation,
  isNewProductQuestion,
  isProductClarificationReply,
  isStructuredProductFollowUp,
  normalizeSession,
  type ResearchSession,
} from "./research-session-store.js";

async function rememberProductPreferences(
  memory: MemoryService,
  preferences: string[],
  constraints: string[],
  category: string,
): Promise<void> {
  for (const statement of memoryStatementsFromPreferences(preferences, constraints, category)) {
    await memory.remember({
      content: statement,
      memoryType: category === "skincare" ? "health_preference" : "shopping_preference",
      scope: `product:${category}`,
      source: "product-clarification",
      evidence: "User answered product clarification question",
    });
  }
}

export async function handleProductRecommendationFlow(deps: {
  memory: MemoryService;
  activity?: ActivityMonitor;
  getSession: () => ResearchSession | null;
  setSession: (s: ResearchSession | null) => void;
  text: string;
  classified: ClassifiedIntent;
  ctx: ToolContext;
}): Promise<string> {
  const prior = normalizeSession(deps.getSession() ?? createResearchSession(deps.text, "product_recommendation"));

  if (isProductClarificationReply(deps.text, prior) && prior.awaitingClarification) {
    const { category, originalQuery } = prior.awaitingClarification;
    const parsed = parseClarificationReply(deps.text, category);
    await rememberProductPreferences(deps.memory, parsed.preferences, parsed.constraints, category);

    const enrichedQuery = [
      originalQuery,
      ...parsed.preferences,
      ...parsed.constraints,
      deps.text.trim(),
    ]
      .filter(Boolean)
      .join(". ");

    const workflow = new ProductRecommendationWorkflow({
      memory: deps.memory,
      onStep: (step) => {
        void deps.activity?.agentStep("HermesSystem", {
          think: step.step,
          detail: step.detail,
          category: "current_run",
        });
      },
    });

    const result = await workflow.run(parseProductIntent(enrichedQuery));
    if (result.clarificationQuestion) {
      deps.setSession({
        ...prior,
        awaitingClarification: prior.awaitingClarification,
        lastAnswer: result.formatted,
      });
      return result.formatted;
    }

    deps.setSession(buildProductSession(prior, originalQuery, enrichedQuery, result));
    return result.formatted;
  }

  if (isStructuredProductFollowUp(deps.text, prior)) {
    const structuredReply = handleStructuredFollowUp(prior, deps.text);
    if (structuredReply) {
      deps.setSession({
        ...prior,
        lastAnswer: structuredReply,
        lastLinks: extractHttpsLinks(structuredReply),
      });
      return structuredReply;
    }
  }

  await deps.activity?.agentStep("HermesSystem", {
    think: "product_recommendation workflow",
    status: "intent=product_recommendation",
    detail: deps.text.slice(0, 80),
    category: "current_run",
  });

  const workflow = new ProductRecommendationWorkflow({
    memory: deps.memory,
    onStep: (step) => {
      void deps.activity?.agentStep("HermesSystem", {
        think: step.step,
        detail: step.detail,
        category: "current_run",
        validatorStatus: step.step === "validate" ? step.detail : undefined,
      });
    },
  });

  const parsed = parseProductIntent(deps.text);
  const result = await workflow.run(parsed);

  if (result.clarificationQuestion) {
    const category = parsed.category ?? "general";
    const session = prior.originalQuestion ? prior : createResearchSession(deps.text, "product_recommendation");
    deps.setSession({
      ...session,
      originalQuestion: session.originalQuestion || deps.text,
      intent: "product_recommendation",
      awaitingClarification: {
        category,
        originalQuery: deps.text,
        askedAt: new Date().toISOString(),
      },
      lastAnswer: result.formatted,
    });
    return result.formatted;
  }

  const topic = deps.classified.entities?.payloadText?.trim() || deps.text.trim();
  const session = isNewProductQuestion(deps.text, prior)
    ? createResearchSession(topic, "product_recommendation")
    : prior.originalQuestion
      ? prior
      : createResearchSession(topic, "product_recommendation");
  deps.setSession(buildProductSession(session, topic, deps.text, result));
  return result.formatted;
}

function buildProductSession(
  session: ResearchSession,
  topic: string,
  _text: string,
  result: { recommendation: ProductRecommendation; formatted: string },
): ResearchSession {
  const valid = hasValidProductResult(result);
  const candidates: ProductCandidate[] = valid
    ? [result.recommendation.winner, ...result.recommendation.alternatives].filter((c) => c.url)
    : [];

  return {
    ...session,
    originalQuestion: topic,
    intent: "product_recommendation",
    awaitingClarification: undefined,
    structuredResult: valid
      ? {
          recommendation: result.recommendation,
          candidates,
          assumptions: result.recommendation.assumptions,
          userPreferencesUsed: result.recommendation.userPreferencesUsed,
        }
      : undefined,
    lastAnswer: result.formatted,
    lastLinks: extractHttpsLinks(result.formatted),
    lastReply: result.formatted,
    topic,
  };
}

function hasValidProductResult(result: {
  recommendation: ProductRecommendation;
  formatted: string;
}): boolean {
  if (result.formatted.includes("I could not get enough reliable product data")) return false;
  return hasValidStructuredRecommendation({
    structuredResult: { recommendation: result.recommendation },
  } as ResearchSession);
}

export function createProductRecommendationHandler(deps: {
  memory: MemoryService;
  activity?: ActivityMonitor;
  session: { get: () => ResearchSession | null; set: (s: ResearchSession | null) => void };
}) {
  return (text: string, classified: ClassifiedIntent, ctx: ToolContext) =>
    handleProductRecommendationFlow({
      memory: deps.memory,
      activity: deps.activity,
      getSession: deps.session.get,
      setSession: deps.session.set,
      text,
      classified,
      ctx,
    });
}

export type { ProductRecommendation };
