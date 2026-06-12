export const MODELS = {
  PRIMARY: process.env.HERMES_PRIMARY_MODEL ?? "anthropic/claude-sonnet-4-5",
  FAST: process.env.HERMES_FAST_MODEL ?? "anthropic/claude-haiku-4-5",
  RESEARCH_FALLBACK: process.env.HERMES_RESEARCH_FALLBACK_MODEL ?? "openai/gpt-4.1",
} as const;

export const MODEL_ROUTING: Record<string, string> = {
  intent_classification: MODELS.FAST,
  primary_reasoning: MODELS.PRIMARY,
  research_synthesis: MODELS.PRIMARY,
  coding: MODELS.PRIMARY,
  autonomous_loop: MODELS.PRIMARY,
  writing: MODELS.FAST,
  memory_agent: MODELS.FAST,
  vision: MODELS.PRIMARY,
};
