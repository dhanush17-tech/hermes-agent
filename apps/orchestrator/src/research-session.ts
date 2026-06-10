import { wantsShoppingOrLinks } from "@hermes-os/shared";
import type { ProductCandidate, ProductRecommendation } from "@hermes-os/recommendations";
import type { EvidenceItem } from "@hermes-os/recommendations";
import {
  explainRecommendation,
  formatCheaperAlternative,
  parseProductIntent,
} from "@hermes-os/recommendations";

export type ProductClarificationState = {
  category: string;
  originalQuery: string;
  askedAt: string;
};

export type ResearchSession = {
  id: string;
  originalQuestion: string;
  intent: string;
  awaitingClarification?: ProductClarificationState;
  structuredResult?: {
    recommendation?: ProductRecommendation;
    candidates?: ProductCandidate[];
    evidence?: EvidenceItem[];
    assumptions?: string[];
    userPreferencesUsed?: string[];
  };
  lastAnswer: string;
  lastLinks: string[];
  createdAt: string;
  /** @deprecated use originalQuestion */
  topic?: string;
  /** @deprecated use lastAnswer */
  lastReply?: string;
};

export function createResearchSession(originalQuestion: string, intent: string): ResearchSession {
  return {
    id: `rs_${Date.now()}`,
    originalQuestion,
    intent,
    lastAnswer: "",
    lastLinks: [],
    createdAt: new Date().toISOString(),
    topic: originalQuestion,
  };
}

export function normalizeSession(session: ResearchSession): ResearchSession {
  return {
    ...session,
    originalQuestion: session.originalQuestion ?? session.topic ?? "",
    lastAnswer: session.lastAnswer ?? session.lastReply ?? "",
    lastLinks: session.lastLinks ?? [],
    intent: session.intent ?? "research",
    id: session.id ?? `rs_${Date.now()}`,
    createdAt: session.createdAt ?? new Date().toISOString(),
  };
}

/** User wants the assistant to apply stored memory without re-asking. */
export function wantsExplicitMemoryUse(text: string): boolean {
  return /\b(take from my memory|from my memory|use my memory|using my memory|based on my memory|remember what you know)\b/i.test(
    text,
  );
}

/** User wants to open a product page in Arc (not compose a tweet). */
export function wantsOpenPurchaseInBrowser(text: string): boolean {
  return /\b(open (?:it|that|the link|in arc)|take me to|go to|show me (?:that|the link|option \d+)|get (?:it|that one)|this one|that one|#?1\b|#?2\b|#?3\b|first one|second one|third one)\b/i.test(
    text,
  );
}

export function pickPurchaseLink(links: string[], text: string): string | null {
  if (!links.length) return null;

  const lower = text.toLowerCase();
  let index = 0;
  if (/\b(second|2nd|#2|option 2)\b/.test(lower)) index = 1;
  else if (/\b(third|3rd|#3|option 3)\b/.test(lower)) index = 2;

  const amazon = links.filter((u) => /amazon\./i.test(u));
  const ordered = amazon.length ? amazon : links;
  return ordered[Math.min(index, ordered.length - 1)] ?? null;
}

export function isResearchFollowUpMessage(text: string): boolean {
  return (
    /\b(link|links|url|buy|purchase|amazon|which one|that one|for me|based on me|you know about me|recommend|recommend me|something for me|what should i get|how do you know|right for me|is this right|send me|gimme|give me|get me|use this|soft pillow|side sleeper|sleeping position|preferences|why that|what about)\b/i.test(
      text,
    ) ||
    isProductExplanationFollowUp(text) ||
    isCheaperFollowUp(text)
  );
}

export function isProductExplanationFollowUp(text: string): boolean {
  return /\b(how did you decide|why this one|is this right for me|what assumptions did you use|how do you know)\b/i.test(
    text,
  );
}

export function isCheaperFollowUp(text: string): boolean {
  return /\b(cheaper one|give me a cheaper|less expensive|lower price)\b/i.test(text);
}

export function isPurchaseLinkFollowUp(text: string): boolean {
  return (
    /\b(give me|send me|get me|share|show me)\b.{0,30}\b(the\s+)?(purchase\s+)?link\b/i.test(text) ||
    /\b(purchase|buy)\s+link\b/i.test(text) ||
    /^\s*(the\s+)?link\s*$/i.test(text.trim())
  );
}

const PRODUCT_TOPIC_KEYWORDS = [
  "iphone",
  "ipad",
  "macbook",
  "pixel",
  "galaxy",
  "phone",
  "smartphone",
  "pillow",
  "mattress",
  "laptop",
  "monitor",
  "headphones",
  "earbuds",
  "desk",
  "chair",
  "keyboard",
  "mouse",
  "moisturizer",
  "skincare",
  "vacuum",
  "tablet",
  "tv",
  "speaker",
] as const;

function mentionedProductKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return PRODUCT_TOPIC_KEYWORDS.filter((k) => lower.includes(k));
}

export function hasValidStructuredRecommendation(session: ResearchSession | null): boolean {
  const rec = session?.structuredResult?.recommendation;
  return Boolean(rec?.winner?.url?.trim() && rec.winner.title?.trim());
}

export function isNewProductQuestion(text: string, session: ResearchSession | null): boolean {
  if (!session || session.intent !== "product_recommendation") return false;

  const t = text.trim();
  if (!t) return false;

  if (isProductExplanationFollowUp(t) || isCheaperFollowUp(t) || isPurchaseLinkFollowUp(t)) {
    return false;
  }

  const priorTopic = session.originalQuestion ?? session.topic ?? "";
  const newParsed = parseProductIntent(t);
  const priorParsed = parseProductIntent(priorTopic);

  if (newParsed.category && priorParsed.category && newParsed.category !== priorParsed.category) {
    return true;
  }

  const newMentions = mentionedProductKeywords(t);
  const priorMentions = mentionedProductKeywords(priorTopic);
  if (
    newMentions.length > 0 &&
    priorMentions.length > 0 &&
    !newMentions.some((m) => priorMentions.includes(m))
  ) {
    return true;
  }

  if (/\b(on sale|price drop|discounted|deal|cheaper now)\b/i.test(t) && newMentions.length > 0) {
    return true;
  }

  if (newMentions.length > 0 && priorMentions.length === 0) {
    return true;
  }

  return false;
}

export function isStructuredProductFollowUp(text: string, session: ResearchSession | null): boolean {
  if (!session || session.intent !== "product_recommendation" || session.awaitingClarification) {
    return false;
  }
  if (!hasValidStructuredRecommendation(session)) return false;
  if (isNewProductQuestion(text, session)) return false;

  return (
    isProductExplanationFollowUp(text) ||
    isCheaperFollowUp(text) ||
    isPurchaseLinkFollowUp(text)
  );
}

export function shouldHandleWithResearchFlow(
  text: string,
  session: ResearchSession | null,
): boolean {
  if (session?.intent === "product_recommendation") {
    return isResearchFollowUpMessage(text);
  }
  return wantsShoppingOrLinks(text) || (Boolean(session) && isResearchFollowUpMessage(text));
}

export function shouldHandleWithProductFlow(text: string, session: ResearchSession | null): boolean {
  if (session?.awaitingClarification) return true;
  if (session?.intent === "product_recommendation" && isResearchFollowUpMessage(text)) return true;
  return false;
}

export function isProductClarificationReply(text: string, session: ResearchSession | null): boolean {
  if (!session?.awaitingClarification) return false;
  const t = text.trim();
  if (!t || t.length > 280) return false;
  if (/^(list skills|promote skills|status|pause|resume|morning brief)/i.test(t)) return false;
  return true;
}

export function buildResearchFollowUpPrompt(
  topic: string,
  followUp: string,
  lastReply?: string,
): string {
  const parts = [`Original research question: ${topic}`, `User follow-up: ${followUp}`];
  if (lastReply) {
    parts.push(`Your previous answer (use this — do not rerun web search):\n${lastReply.slice(0, 6000)}`);
  }
  parts.push(
    "Rules:",
    "- Answer from your previous structured recommendation and stated assumptions.",
    "- Do not return new generic search links.",
    "- Be honest about what preferences were used or missing.",
    "- Reply in 2–4 sentences, conversational.",
  );
  return parts.join("\n\n");
}

export function handleStructuredFollowUp(session: ResearchSession, followUp: string): string | null {
  const rec = session.structuredResult?.recommendation;
  if (!rec?.winner?.url) return null;

  if (isProductExplanationFollowUp(followUp)) {
    return explainRecommendation(rec, followUp);
  }

  if (isPurchaseLinkFollowUp(followUp)) {
    return `Purchase link for ${rec.winner.title}: ${rec.winner.url}`;
  }

  if (isCheaperFollowUp(followUp) && session.structuredResult?.candidates?.length) {
    const candidates = session.structuredResult.candidates;
    const sorted = [...candidates].sort((a, b) => (a.price ?? 9999) - (b.price ?? 9999));
    const cheaper = sorted.find((c) => c.url !== rec.winner.url && (c.price ?? 9999) < (rec.winner.price ?? 9999));
    if (cheaper) return formatCheaperAlternative(rec, cheaper);
  }

  return null;
}
