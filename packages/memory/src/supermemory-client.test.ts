import { describe, expect, it } from "vitest";
import { SupermemoryClient } from "./supermemory-client.js";

describe("SupermemoryClient search parsing", () => {
  const client = new SupermemoryClient("sm_test_key");

  it("parses document results with nested chunks", () => {
    const hits = (
      client as unknown as { parseSearchResults: (data: unknown) => { content: string }[] }
    ).parseSearchResults({
      results: [
        {
          documentId: "doc_1",
          chunks: [
            {
              content: "User lives in Austin, Texas",
              score: 0.91,
              isRelevant: true,
            },
          ],
        },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.content).toBe("User lives in Austin, Texas");
  });

  it("parses hybrid memory hits", () => {
    const hits = (
      client as unknown as { parseSearchResults: (data: unknown) => { content: string }[] }
    ).parseSearchResults({
      results: [{ id: "mem_1", memory: "User enjoys swimming", similarity: 0.88 }],
    });
    expect(hits[0]?.content).toBe("User enjoys swimming");
  });
});
