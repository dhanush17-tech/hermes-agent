export type ResearchSession = {
  topic: string;
  lastReply?: string;
  lastLinks?: string[];
};

/** User wants to open a product page in Arc (not compose a tweet). */
export function wantsOpenPurchaseInBrowser(text: string): boolean {
  return /\b(buy|purchase|order|checkout|open (?:it|that|the link|in arc)|get (?:it|that one)|take me to|this one|that one|#?1\b|first one|second one)\b/i.test(
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
  return /\b(link|links|url|buy|purchase|amazon|which one|that one|for me|how do you know|right for me|is this right|send me|gimme|give me|why that|what about)\b/i.test(
    text,
  );
}

export function buildResearchFollowUpPrompt(
  topic: string,
  followUp: string,
  lastReply?: string,
): string {
  const parts = [
    `Original research question: ${topic}`,
    `User follow-up: ${followUp}`,
  ];
  if (lastReply) {
    parts.push(`Your previous answer (use this — do not claim you cannot browse):\n${lastReply.slice(0, 6000)}`);
  }
  parts.push(
    "Rules:",
    "- If they ask for links, repeat or refine direct https:// URLs from your previous answer (Amazon search or product links).",
    "- Apply stored user preferences (sleep position, firmness, etc.) from the memory block.",
    "- Do not say you cannot browse unless a tool actually failed.",
    "- Answer with: Answer, Confidence, Reasoning, Evidence, Risks, Next action.",
  );
  return parts.join("\n\n");
}
