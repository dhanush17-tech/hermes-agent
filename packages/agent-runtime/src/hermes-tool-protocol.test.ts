import { describe, expect, it } from "vitest";
import { buildDefaultToolCatalog, parseAgentRunOutput } from "./hermes-tool-protocol.js";

describe("Hermes tool protocol", () => {
  it("parses structured tool, memory, and skill candidates", () => {
    const output = parseAgentRunOutput(
      JSON.stringify({
        final: "done",
        toolRequests: [
          {
            toolName: "gmail.search",
            payload: { q: "newer_than:3d" },
            reason: "Find recent messages",
            riskHint: "read",
          },
        ],
        memoryCandidates: [
          {
            type: "user_preference",
            content: "User prefers concise email briefs",
            confidence: "high",
            sensitivity: "normal",
          },
        ],
        skillCandidates: [
          {
            name: "gmail.check_devlabs_people_inbox",
            description: "Check the DevLabs people inbox",
            triggerExamples: ["check people@devlabs.com"],
            steps: [{ toolName: "gmail.search", payload: {}, reason: "Search inbox" }],
            safetyNotes: ["Draft but do not send replies"],
          },
        ],
        reasoningSummary: "Used Gmail connector first.",
      }),
      "session-1",
    );

    expect(output.sessionId).toBe("session-1");
    expect(output.toolRequests?.[0]?.toolName).toBe("gmail.search");
    expect(output.memoryCandidates).toHaveLength(1);
    expect(output.skillCandidates?.[0]?.steps[0]?.toolName).toBe("gmail.search");
  });

  it("falls back to final text for invalid JSON", () => {
    const output = parseAgentRunOutput("plain answer");

    expect(output.final).toBe("plain answer");
    expect(output.toolRequests).toBeUndefined();
  });

  it("does not expose raw terminal.run in the default catalog when filtered by caller", () => {
    const catalog = buildDefaultToolCatalog(["gmail.search", "terminal.propose_command"]);

    expect(catalog.map((tool) => tool.name)).toEqual([
      "gmail.search",
      "terminal.propose_command",
    ]);
    expect(catalog.find((tool) => tool.name === "terminal.propose_command")?.approval).toBe(
      "sometimes",
    );
  });
});
