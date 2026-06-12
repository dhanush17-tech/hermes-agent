import type { JSONSchema7 } from "json-schema";
import { describe, expect, it, vi, afterEach } from "vitest";
import { llmCall, llmJson, llmStructured, sanitizeJsonSchemaForProviders } from "./openrouter-client.js";
import { AGENT_RESPONSE_SCHEMA } from "./schemas/agent-response-schema.js";
import { INTENT_SCHEMA, validateIntentResult } from "./schemas/intent-schema.js";

describe("sanitizeJsonSchemaForProviders", () => {
  it("removes number minimum and maximum constraints", () => {
    const sanitized = sanitizeJsonSchemaForProviders(INTENT_SCHEMA);
    const confidence = sanitized.properties?.confidence;
    expect(confidence && typeof confidence === "object").toBe(true);
    if (confidence && typeof confidence === "object") {
      expect("minimum" in confidence).toBe(false);
      expect("maximum" in confidence).toBe(false);
    }
  });

  it("removes unsupported array and string length constraints from nested schemas", () => {
    const withConstraints: JSONSchema7 = {
      ...AGENT_RESPONSE_SCHEMA,
      properties: {
        ...AGENT_RESPONSE_SCHEMA.properties,
        skillCandidates: {
          type: "array",
          minItems: 5,
          items: {
            type: "object",
            properties: {
              triggerExamples: { type: "array", items: { type: "string" }, minItems: 2 },
            },
          },
        },
      },
    };
    const sanitized = sanitizeJsonSchemaForProviders(withConstraints);
    const violations = collectForbiddenSchemaConstraints(sanitized);
    expect(violations).toEqual([]);
  });
});

function collectForbiddenSchemaConstraints(schema: JSONSchema7): string[] {
  const violations: string[] = [];
  const walk = (node: JSONSchema7 | boolean, path: string) => {
    if (typeof node !== "object" || node === null) return;
    if (node.minimum !== undefined) violations.push(`${path}.minimum`);
    if (node.maximum !== undefined) violations.push(`${path}.maximum`);
    if (node.minItems !== undefined) violations.push(`${path}.minItems=${node.minItems}`);
    if (node.maxItems !== undefined) violations.push(`${path}.maxItems=${node.maxItems}`);
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        walk(value as JSONSchema7, `${path}.${key}`);
      }
    }
    if (node.items) {
      if (Array.isArray(node.items)) {
        node.items.forEach((item, i) => walk(item, `${path}.items[${i}]`));
      } else {
        walk(node.items, `${path}.items`);
      }
    }
    for (const key of ["anyOf", "allOf", "oneOf"] as const) {
      const branch = node[key];
      if (Array.isArray(branch)) {
        branch.forEach((item, i) => walk(item, `${path}.${key}[${i}]`));
      }
    }
  };
  walk(schema, "schema");
  return violations;
}

describe("llmCall", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when tools and responseFormat are both set", async () => {
    await expect(
      llmCall({
        messages: [{ role: "user", content: "hi" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test",
              description: "test",
              parameters: { type: "object", properties: {} },
            },
          },
        ],
        responseFormat: { type: "json_object" },
      }),
    ).rejects.toThrow(/cannot use both tools and responseFormat/);
  });
});

describe("llmStructured", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("parses strict json_schema responses", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  intent: "research",
                  confidence: 0.9,
                  entities: [],
                  routing_hint: "lookup",
                }),
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
          model: "anthropic/claude-sonnet-4-5",
        }),
        { status: 200 },
      ),
    );

    const result = await llmStructured({
      schemaName: "intent_classification",
      schema: INTENT_SCHEMA,
      messages: [{ role: "user", content: "what is rust" }],
      validate: validateIntentResult,
    });

    expect(result.intent).toBe("research");

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const confidence = body.response_format.json_schema.schema.properties.confidence;
    expect(confidence.minimum).toBeUndefined();
    expect(confidence.maximum).toBeUndefined();
  });
});

describe("llmJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENROUTER_API_KEY;
  });

  it("strips markdown fences before validation", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "```json\n{\"intent\":\"unknown\",\"confidence\":0.1,\"entities\":[],\"routing_hint\":\"x\"}\n```",
              },
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
          model: "anthropic/claude-haiku-4-5",
        }),
        { status: 200 },
      ),
    );

    const result = await llmJson({
      messages: [{ role: "user", content: "hi" }],
      validate: validateIntentResult,
    });

    expect(result.intent).toBe("unknown");
  });
});
