import { describe, expect, it, vi } from "vitest";
import { dedupeToolRequests, executeAgentToolRequests } from "./agent-tool-runner.js";
import type { ToolExecutor } from "@hermes-os/tool-executor";

describe("agent-tool-runner", () => {
  it("dedupes identical tool requests", () => {
    const reqs = [
      { tool: "web.fetch", payload: {} },
      { tool: "web.fetch", payload: {} },
      { tool: "web.fetch", payload: { url: "https://apple.com" } },
    ];
    expect(dedupeToolRequests(reqs, 3)).toHaveLength(2);
  });

  it("normalizes query-only web.fetch before invoke", async () => {
    const invoke = vi.fn().mockResolvedValue({ status: "success", data: { content: "ok" } });
    const executor = { invoke } as unknown as ToolExecutor;
    await executeAgentToolRequests(
      [{ tool: "web.fetch", payload: { query: "iphone 17 price" } }],
      { actor: "u", workspaceRoot: "/tmp" },
      executor,
      { userMessage: "iphone price" },
    );
    expect(invoke).toHaveBeenCalledWith(
      "web.fetch",
      expect.objectContaining({ url: expect.stringContaining("google.com/search") }),
      expect.any(Object),
      expect.any(Object),
    );
  });
});
