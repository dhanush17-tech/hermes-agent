import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "./agent-runtime.js";
import type { AgentRunInput, AgentRunOutput, RuntimeKind } from "./types.js";
import { RuntimeRouter } from "./runtime-router.js";

function runtime(kind: Exclude<RuntimeKind, "local">, available: boolean): AgentRuntime {
  return {
    kind,
    isAvailable: async () => available,
    run: async (_input: AgentRunInput): Promise<AgentRunOutput> => ({ final: kind }),
    continue: async (_sessionId: string, _input: AgentRunInput): Promise<AgentRunOutput> => ({
      final: kind,
    }),
  };
}

describe("RuntimeRouter", () => {
  it("chooses Hermes for research when the gateway is available", async () => {
    const router = new RuntimeRouter({
      hermes: runtime("hermes_primary", true),
      cloudflare: runtime("cloudflare", true),
    });

    await expect(router.chooseKind("research")).resolves.toBe("hermes_primary");
  });

  it("falls back to Cloudflare for serious tasks when Hermes is down", async () => {
    const router = new RuntimeRouter({
      hermes: runtime("hermes_primary", false),
      cloudflare: runtime("cloudflare", true),
    });

    await expect(router.chooseKind("coding")).resolves.toBe("cloudflare");
  });

  it("keeps approval and status handling local", async () => {
    const router = new RuntimeRouter({
      hermes: runtime("hermes_primary", true),
      cloudflare: runtime("cloudflare", true),
    });

    await expect(router.chooseKind("approval_response")).resolves.toBe("local");
    await expect(router.chooseKind("status")).resolves.toBe("local");
  });

  it("uses Cloudflare for cheap utility model tasks", async () => {
    const router = new RuntimeRouter({
      hermes: runtime("hermes_primary", true),
      cloudflare: runtime("cloudflare", true),
    });

    await expect(router.chooseKind("classification")).resolves.toBe("cloudflare");
    await expect(router.chooseKind("extraction")).resolves.toBe("cloudflare");
  });
});
