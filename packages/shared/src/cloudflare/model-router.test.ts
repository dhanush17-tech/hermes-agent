import { describe, expect, it } from "vitest";
import { ModelRouter } from "./model-router.js";

describe("ModelRouter", () => {
  const router = new ModelRouter({
    default: "@cf/zai-org/glm-4.7-flash",
    routes: {
      research: "@cf/openai/gpt-oss-20b",
      coding: "@cf/qwen/qwen2.5-coder-32b-instruct",
      unknown: "@cf/zai-org/glm-4.7-flash",
    },
    hermes_providers: {
      "cf-reason": "@cf/openai/gpt-oss-20b",
    },
  });

  it("picks task-specific models", () => {
    expect(router.resolve("research")).toBe("@cf/openai/gpt-oss-20b");
    expect(router.resolve("coding")).toBe("@cf/qwen/qwen2.5-coder-32b-instruct");
    expect(router.resolve("writing")).toBe("@cf/zai-org/glm-4.7-flash");
  });

  it("maps Hermes provider aliases", () => {
    expect(router.hermesModelCommand("research")).toBe(
      "/model custom:cf-reason:@cf/openai/gpt-oss-20b",
    );
  });
});
