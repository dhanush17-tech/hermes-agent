import { describe, expect, it, vi, afterEach } from "vitest";
import { classifyIntent } from "./intent-classifier.js";

describe("classifyIntent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("returns unknown when llm fails", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));

    const result = await classifyIntent("hello");
    expect(result.intent).toBe("unknown");
  });
});
