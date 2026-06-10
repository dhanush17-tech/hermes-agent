import {
  llmJson,
  MODELS,
  UNKNOWN_INTENT_RESULT,
  validateIntentResult,
  type IntentResult,
} from "@hermes-os/llm-client";

const INTENT_SYSTEM_PROMPT = `You are the intent classifier for Hermes Personal OS.

Classify the user's message into exactly one intent. Return only valid JSON matching this shape:
{
  "intent": "research|approval_response|status|laptop_control|coding|writing|browser_task|memory_update|personal_ops|unknown",
  "confidence": 0.0-1.0,
  "entities": [{"type": "app|person|url|product|time|location|...", "value": "..."}],
  "routing_hint": "one sentence"
}

INTENT DEFINITIONS:
- research: Questions, lookups, comparisons, "find me", "what is", "how much", shopping, prices, sales, availability, release status — anything needing current web evidence
- approval_response: User is responding to a pending approval (approve/deny/edit + ID or reference)
- status: pause/resume/stop/emergency_stop/build status requests
- laptop_control: Open apps, browse specific sites, interact with third-party services via Arc or desktop
- coding: Write code, fix bugs, code.self_edit, modify the Hermes codebase, run tests
- writing: Draft messages, iMessage copy, emails, posts — output is text the user will send
- browser_task: Browse/read a webpage, extract info from a URL (no app interaction needed)
- memory_update: Explicit remember/forget/what do you know about...
- personal_ops: Morning brief, calendar check, task review, "what's on my plate"
- unknown: General conversation, questions about Hermes itself, unclear intent

ROUTING HINTS:
- Gmail/email AND a specific action → laptop_control
- Calendar/schedule → personal_ops
- Twitter/X, LinkedIn, Slack → laptop_control
- Shopping/comparison with "best" or "recommend" → research
- Price, sale, discount, "how much", availability, release date → research (never unknown/personal_ops)
- Follow-up to previous message → match previous intent context
- Uber/Lyft/rideshare → laptop_control

ENTITIES: Extract named things (app names, people, URLs, product names, locations, time references).`;

export async function classifyIntent(
  message: string,
  opts: {
    conversationHistory?: Array<{ role: string; content: string }>;
    memoryContext?: string;
  } = {},
): Promise<IntentResult> {
  const systemPrompt = opts.memoryContext
    ? `${INTENT_SYSTEM_PROMPT}\n\n${opts.memoryContext}`
    : INTENT_SYSTEM_PROMPT;

  const recentHistory = (opts.conversationHistory ?? []).slice(-4);

  try {
    return await llmJson({
      model: MODELS.FAST,
      temperature: 0.1,
      max_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        ...recentHistory.map((h) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
      validate: validateIntentResult,
    });
  } catch {
    return UNKNOWN_INTENT_RESULT;
  }
}
