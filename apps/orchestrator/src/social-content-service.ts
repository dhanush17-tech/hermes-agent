import { llmCall, MODELS } from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { MemoryService } from "@hermes-os/memory";
import { resolveIdentityContext } from "@hermes-os/memory";

export function isSocialContentAdviceQuery(text: string): boolean {
  const t = text.trim();
  if (!/\b(twi+tter|x\.com|\bx\b)/i.test(t)) return false;
  return (
    /\b(what should i|what to|post next|tweet next|content ideas?|what do you think i should post|ideas? for (?:a )?post)\b/i.test(
      t,
    ) || /\bpost\b.*\b(on|to)\b.*\b(twi+tter|x)\b/i.test(t)
  );
}

export function isTwitterFeedCheckQuery(text: string): boolean {
  const t = text.trim();
  if (!/\b(twi+tter|x\.com|timeline|feed)\b/i.test(t)) return false;
  return /\b(check|read|scan|look at|review|see|tell me)\b/i.test(t);
}

export function isSocialOpsQuery(text: string): boolean {
  return isSocialContentAdviceQuery(text) || isTwitterFeedCheckQuery(text);
}

export async function handleSocialContentAdvice(
  text: string,
  executor: ToolExecutor,
  memory: MemoryService,
  ctx: ToolContext,
): Promise<string> {
  const identity = await resolveIdentityContext(memory, text);
  const handle = identity.twitterHandles.find((h) => h.label === "personal")?.handle
    ?? identity.twitterHandles[0]?.handle
    ?? "geeky_dan";

  let feedPreview = "";
  const arc = await executor.invoke(
    "browser.arc_read",
    { url: `https://x.com/${handle}`, expect: "twitter", reuseOnly: true },
    ctx,
    { summary: `Read @${handle} timeline for post ideas` },
  );
  if (arc.status === "success") {
    feedPreview = String((arc.data as { text?: string }).text ?? "").slice(0, 2000);
  }

  const memoryBlock = await memory.formatContextForPrompt(text, 12);
  const prompt = [
    text,
    "",
    `User's personal X/Twitter: @${handle}`,
    identity.twitterHandles.length > 1
      ? `Also: ${identity.twitterHandles.map((h) => `@${h.handle} (${h.label})`).join(", ")}`
      : "",
    feedPreview ? `Recent timeline (from Arc):\n${feedPreview}` : "Timeline not open in Arc — use memory and general knowledge.",
    "",
    "User memory:",
    memoryBlock,
    "",
    "Reply like a sharp personal assistant in iMessage/chat:",
    "- 2–4 sentences max unless they asked for a list",
    "- Give 2–3 concrete post ideas tailored to their voice",
    "- No memorandum, no numbered report sections, no 'What I would do' headers",
    "- Warm and direct — not a research analyst",
  ]
    .filter(Boolean)
    .join("\n");

  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    return "Set OPENROUTER_API_KEY to get social content advice.";
  }

  const res = await llmCall({
    model: MODELS.FAST,
    max_tokens: 512,
    temperature: 0.4,
    messages: [{ role: "user", content: prompt }],
  });

  return res.content?.trim() || "I couldn't generate post ideas right now.";
}
