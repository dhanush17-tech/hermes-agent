import { describe, expect, it } from "vitest";
import { formatConversationForPrompt, toChatApiHistory } from "./conversation-history.js";
import type { ChatTurn } from "./types.js";

describe("conversation history", () => {
  it("formats thread for system prompt", () => {
    const turns: ChatTurn[] = [
      { role: "user", content: "Momentum demo day — only Kickstart said yes" },
      { role: "assistant", content: "Lean on Kickstart and tighten the pitch." },
    ];
    const block = formatConversationForPrompt(turns);
    expect(block).toContain("Momentum demo day");
    expect(block).toContain("Kickstart");
  });

  it("maps to chat API history", () => {
    const turns: ChatTurn[] = [
      { role: "user", content: "what kind of feedback?" },
    ];
    expect(toChatApiHistory(turns)).toEqual([{ role: "user", content: "what kind of feedback?" }]);
  });
});
