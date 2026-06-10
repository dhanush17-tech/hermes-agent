import type { IntentResult } from "@hermes-os/llm-client";

/**
 * Questions whose answers change over time and must not be answered from model training data.
 */
export function requiresLiveLookup(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  if (
    /\b(prices?|pricing|cost|how much|msrp|on sale|sale\b|discount|discounted|deal|deals|price drop|cheaper|cheapest|worth (?:it|buying)|should i buy)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /\b(in stock|out of stock|available (?:now|yet)|release date|released|launch(?:ed)?|is .+ (?:out|available|released)|when (?:did|does|will).+(?:release|come out|launch))\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /\b(current(?:ly)?|latest|today|right now|as of now|this week|this month)\b/i.test(t) &&
    /\b(news|score|rate|stock|crypto|weather|election|who won|who is)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

export function routingIntentForMessage(intent: IntentResult, text: string): IntentResult["intent"] {
  if (requiresLiveLookup(text)) return "research";
  return intent.intent;
}
