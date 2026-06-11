import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MODELS, isOpenRouterConfigured, openRouterHealthCheck } from "./openrouter.js";

describe("llm-client model routing", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.LLM_PRIMARY_MODEL;
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("exposes the three model tiers", () => {
    expect(MODELS.primary).toContain("/");
    expect(MODELS.reasoning).toContain("/");
    expect(MODELS.cheap).toContain("/");
  });

  it("reports unconfigured when no key is set", () => {
    expect(isOpenRouterConfigured()).toBe(false);
  });

  it("health check is false (not a throw) when unconfigured", async () => {
    await expect(openRouterHealthCheck()).resolves.toBe(false);
  });
});
