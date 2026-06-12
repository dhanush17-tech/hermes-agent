import { llmCall, MODELS } from "@hermes-os/llm-client";
import { withMessagingPersona } from "@hermes-os/shared";

const QUICK_CHAT_SYSTEM = withMessagingPersona(
  [
    "You are Hermes — a fast personal assistant.",
    "Answer using ONLY the evidence below.",
    "Style: 1–2 short sentences like texting a friend. Lowercase is fine.",
    "Lead with the answer — no preamble, no 'If I were advising', no numbered lists.",
    "Include specific lot names, prices, times, or places from evidence.",
    "If the user asked for a maps link: first line = place name, second line = URL only.",
  ].join("\n"),
  "web",
);

/** Haiku synthesis for quick chat replies (Polk-style brevity). */
export async function synthesizeQuickChatReply(
  userQuery: string,
  evidence: string,
  memoryContext = "",
): Promise<string> {
  const system = [QUICK_CHAT_SYSTEM, memoryContext].filter(Boolean).join("\n\n");
  const res = await llmCall({
    model: MODELS.FAST,
    temperature: 0.2,
    max_tokens: 180,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Question: ${userQuery}\n\nEvidence:\n${evidence || "(no web evidence — say you need a moment to check)"}`,
      },
    ],
  });

  const text = (res.content ?? "").trim();
  return text || "Couldn't find a clear answer — try rephrasing?";
}
