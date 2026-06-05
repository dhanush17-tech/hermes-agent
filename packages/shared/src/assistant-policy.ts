/**
 * Global behavior: Hermes acts via tools — avoid LLM refusals when action is possible.
 */
export const HERMES_ASSISTANT_POLICY = [
  "CRITICAL — Hermes Personal OS behavior:",
  "- NEVER say you cannot browse, cannot access the internet, or are unable to help if any tool can apply.",
  "- You HAVE: research, Arc browser (browser.goto for Gmail/X/LinkedIn — no API keys), screen capture, web.fetch, code.self_edit, custom tools, memory.",
  "- If stuck: replan, try code.self_edit, then ask the user one clear question and wait.",
  "- If the user wants a link: provide https:// URLs (Amazon search links are fine). Repeat links from the conversation if already given.",
  "- If something needs live browsing: say you are opening Arc or use research links — do not refuse.",
  "- Prefer doing something useful over apologizing. Only say no when a tool returned denied/pending_approval.",
].join("\n");

/** Short iMessage / chat voice — same channel, same rules. */
export const HERMES_MESSAGING_PERSONA = [
  "Reply style (this text is sent directly to the user — iMessage or chat):",
  "- Output ONLY the final reply. Never show numbered steps, analysis, memory checks, or draft options.",
  "- Short and direct: 1–3 sentences unless they asked for detail, a list, or links.",
  "- Casual, warm, capable — like texting a friend.",
  "- Lead with the answer. No preamble.",
  "- Use stored memory naturally; don't say \"according to my memory\" unless unsure.",
].join("\n");

/** @deprecated use isMessagingChannel */
export const HERMES_CHAT_PERSONA = HERMES_MESSAGING_PERSONA;

export function isMessagingChannel(channel?: string): boolean {
  return channel === "web" || channel === "imessage";
}

export function withAssistantPolicy(system?: string): string {
  const parts = [system?.trim(), HERMES_ASSISTANT_POLICY].filter(Boolean);
  return parts.join("\n\n");
}

export function withMessagingPersona(system?: string, channel?: string): string {
  const base = system?.trim();
  if (!isMessagingChannel(channel)) return withAssistantPolicy(base);
  return withAssistantPolicy([base, HERMES_MESSAGING_PERSONA].filter(Boolean).join("\n\n"));
}

/** @deprecated use withMessagingPersona */
export function withChatPersona(system?: string, channel?: string): string {
  return withMessagingPersona(system, channel);
}

/** Only when the user clearly wants X/Twitter — not generic "post" in other contexts. */
export function wantsExplicitTweet(text: string): boolean {
  return /\b(tweet|post a tweet|post to x|post on twitter|compose (?:a )?tweet)\b/i.test(text);
}

export function wantsShoppingOrLinks(text: string): boolean {
  return /\b(link|links|url|buy|purchase|order|amazon|price|where (?:to|can i) (?:buy|get)|best .{0,40}(?:for|to buy)|gimme|give me|send me|find me)\b/i.test(
    text,
  );
}

/** Gmail, social, inbox — always browser + autonomous loop, never API-only chat. */
export function needsBrowserAutonomy(text: string): boolean {
  return /\b(gmail|google mail|inbox|unread|email|twitter|linkedin|x\.com|feed|calendar|slack|notion|github|check my|analyze my|scan my|monitor|open\s+https?)\b/i.test(
    text,
  );
}

export function needsAgentPlanner(text: string): boolean {
  return (
    needsBrowserAutonomy(text) ||
    wantsShoppingOrLinks(text) ||
    /\b(and then|check|open|run|build|create|implement|write|fix|fetch|send|install|tool|macro|code|execute|task|do this|help me|continue|proceed|figure out|think)\b/i.test(
      text,
    )
  );
}

const REFUSAL_PATTERNS = [
  /\bunable to browse\b/i,
  /\bcannot browse\b/i,
  /\bcan't browse\b/i,
  /\bcan not browse\b/i,
  /\bI am unable to\b/i,
  /\bI'm unable to\b/i,
  /\bI cannot (?:browse|access|help)\b/i,
  /\bI can't (?:browse|access|help)\b/i,
  /\bdon'?t have access to (?:the )?internet\b/i,
  /\bno (?:way|ability) to browse\b/i,
  /\bas an ai,? I (?:cannot|can't)\b/i,
];

export function isRefusalResponse(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text));
}

/** Pull https links from prior assistant text for link follow-ups. */
export function extractHttpsLinks(text: string, max = 8): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]>"]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const url = m.replace(/[),.]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
      if (out.length >= max) break;
    }
  }
  return out;
}

export function formatLinksFallback(links: string[], preamble?: string): string {
  if (!links.length) {
    return (
      preamble ??
      "Here are search links you can use:\n\nhttps://www.amazon.com/s?k=best+pillow+side+sleeper+medium+soft"
    );
  }
  const lines = links.map((u, i) => `${i + 1}. ${u}`);
  return [preamble ?? "Here are the links from our research:", "", ...lines].join("\n");
}
