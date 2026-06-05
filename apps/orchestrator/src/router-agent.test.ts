import { describe, expect, it } from "vitest";
import type { ClassifiedIntent } from "@hermes-os/shared";
import { RouterAgent } from "./router-agent.js";

describe("RouterAgent", () => {
  it("delegates to the injected classifier", async () => {
    const stub: Pick<import("@hermes-os/shared").IntentClassifier, "classify"> = {
      classify: async () =>
        ({ intent: "research", confidence: 0.95 }) satisfies ClassifiedIntent,
    };
    const router = new RouterAgent(stub as import("@hermes-os/shared").IntentClassifier);
    const result = await router.classify("pillow recommendations");
    expect(result.intent).toBe("research");
  });

  it("returns unknown when classifier is missing", async () => {
    const router = new RouterAgent(null);
    const result = await router.classify("hello");
    expect(result.intent).toBe("unknown");
  });
});
