import { describe, expect, it, vi } from "vitest";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { ToolContext } from "@hermes-os/shared";
import {
  isWeatherQuery,
  isLocationCorrection,
  recentWeatherQueryInHistory,
  shouldHandleWeatherTurn,
  resolveWeatherLocation,
  handleWeatherTurn,
} from "./weather-service.js";

describe("weather-service", () => {
  it("detects weather queries", () => {
    expect(isWeatherQuery("how's the weather")).toBe(true);
    expect(isWeatherQuery("what is the weather like today")).toBe(true);
    expect(isWeatherQuery("hey im in Stanford")).toBe(false);
  });

  it("detects location corrections after a weather ask", () => {
    const history = [
      { role: "user", content: "how's the weather" },
      { role: "assistant", content: "77°F in Scottsdale" },
    ];
    expect(isLocationCorrection("hey im in Stanford right now, did you not know that?")).toBe(true);
    expect(recentWeatherQueryInHistory(history)).toBe(true);
    expect(shouldHandleWeatherTurn("hey im in Stanford right now", history)).toBe(true);
  });

  it("resolves Stanford from correction message", () => {
    const memCtx = { systemBlock: "", rawMemories: [] };
    const loc = resolveWeatherLocation("hey im in Stanford right now", memCtx, []);
    expect(loc).toBe("Stanford");
  });

  it("prefers street address from memory", () => {
    const memCtx = {
      systemBlock: "User lives at 566 Arguello Way in Stanford, CA.",
      rawMemories: [],
    };
    const loc = resolveWeatherLocation("how's the weather", memCtx, []);
    expect(loc).toContain("566 Arguello Way");
    expect(loc).toMatch(/Stanford/i);
  });

  it("sanitizes messy memory location text", () => {
    const memCtx = {
      systemBlock: "566 Arguello Way), not Arizona, Stanford, CA",
      rawMemories: [],
    };
    const loc = resolveWeatherLocation("how's the weather", memCtx, []);
    expect(loc).toBe("566 Arguello Way, Stanford, CA");
  });

  it("fetches weather via web.fetch", async () => {
    const invoke = vi.fn().mockResolvedValue({
      status: "success",
      data: { content: "Stanford: ☀️ +18°C", status: 200 },
    });
    const executor = { invoke } as unknown as ToolExecutor;
    const ctx = { actor: "user", workspaceRoot: "/tmp", conversationHistory: [] } as ToolContext;
    const memCtx = {
      systemBlock: "Current location: 566 Arguello Way, Stanford, CA",
      rawMemories: [],
    };

    const reply = await handleWeatherTurn("how's the weather", ctx, executor, memCtx);

    expect(invoke).toHaveBeenCalledWith(
      "web.fetch",
      expect.objectContaining({ url: expect.stringContaining("wttr.in") }),
      ctx,
      expect.any(Object),
    );
    expect(reply).toMatch(/Stanford|weather|°|°C|°F/i);
  });
});
