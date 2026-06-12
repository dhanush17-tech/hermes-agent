import type { JSONSchema7 } from "json-schema";
import { MODELS } from "./model-config.js";

export type ChatMessageRole = "system" | "user" | "assistant" | "tool";

export type TextContentPart = { type: "text"; text: string };
export type ImageContentPart = {
  type: "image_url";
  image_url: { url: string };
};

export type ChatMessage = {
  role: ChatMessageRole;
  content: string | null | Array<TextContentPart | ImageContentPart>;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema7;
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type StructuredOutputOptions = {
  schemaName: string;
  schema: JSONSchema7;
};

export type LLMCallOptions = {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  max_tokens?: number;
  temperature?: number;
  responseFormat?: StructuredOutputOptions | { type: "json_object" };
  stream?: boolean;
};

export type LLMResponse = {
  content: string | null;
  tool_calls?: ToolCall[];
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
};

const BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return key;
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```json|```/g, "").trim();
}

function stripUnsupportedSchemaConstraints(out: JSONSchema7): void {
  delete out.minimum;
  delete out.maximum;
  delete out.exclusiveMinimum;
  delete out.exclusiveMaximum;
  delete out.multipleOf;

  // Anthropic/Bedrock via OpenRouter: only minItems/maxItems of 0 or 1 are supported — strip all.
  delete out.minItems;
  delete out.maxItems;
  delete out.minLength;
  delete out.maxLength;
  delete out.uniqueItems;
}

/** Strip JSON Schema constraints unsupported by Anthropic/Bedrock via OpenRouter. */
export function sanitizeJsonSchemaForProviders(schema: JSONSchema7): JSONSchema7 {
  const walk = (node: JSONSchema7 | boolean): JSONSchema7 | boolean => {
    if (typeof node !== "object" || node === null) return node;

    const out: JSONSchema7 = { ...node };
    stripUnsupportedSchemaConstraints(out);

    if (out.properties) {
      const props: Record<string, JSONSchema7 | boolean> = {};
      for (const [key, value] of Object.entries(out.properties)) {
        props[key] = walk(value) as JSONSchema7 | boolean;
      }
      out.properties = props;
    }

    if (out.items) {
      if (Array.isArray(out.items)) {
        out.items = out.items.map((item) => walk(item) as JSONSchema7);
      } else {
        out.items = walk(out.items) as JSONSchema7 | boolean;
      }
    }

    for (const key of ["anyOf", "allOf", "oneOf"] as const) {
      const branch = out[key];
      if (Array.isArray(branch)) {
        out[key] = branch.map((item) => walk(item) as JSONSchema7);
      }
    }

    if (out.definitions) {
      const defs: Record<string, JSONSchema7 | boolean> = {};
      for (const [key, value] of Object.entries(out.definitions)) {
        defs[key] = walk(value) as JSONSchema7 | boolean;
      }
      out.definitions = defs;
    }

    if (out.$defs) {
      const defs: Record<string, JSONSchema7 | boolean> = {};
      for (const [key, value] of Object.entries(out.$defs)) {
        defs[key] = walk(value) as JSONSchema7 | boolean;
      }
      out.$defs = defs;
    }

    return out;
  };

  return walk(schema) as JSONSchema7;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return JSON.parse(stripJsonFences(content));
  }
}

export async function llmCall(opts: LLMCallOptions): Promise<LLMResponse> {
  if (opts.tools?.length && opts.responseFormat) {
    throw new Error("llmCall: cannot use both tools and responseFormat simultaneously");
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? MODELS.PRIMARY,
    messages: opts.messages,
    max_tokens: opts.max_tokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
  };

  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = opts.tool_choice ?? "auto";
  }

  if (opts.responseFormat) {
    if ("type" in opts.responseFormat && opts.responseFormat.type === "json_object") {
      body.response_format = { type: "json_object" };
    } else {
      const structured = opts.responseFormat as StructuredOutputOptions;
      const schema = sanitizeJsonSchemaForProviders({
        ...structured.schema,
        additionalProperties: structured.schema.additionalProperties ?? false,
      });
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: structured.schemaName,
          strict: true,
          schema,
        },
      };
      // response-healing can inject unsupported minItems/minimum constraints on some providers.
    }
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.OPENROUTER_APP_URL ?? "https://hermes-agent.local",
      "X-Title": process.env.OPENROUTER_APP_NAME ?? "Hermes Personal OS",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
    model: string;
  };

  const choice = data.choices[0];
  if (!choice) {
    throw new Error("OpenRouter error: empty choices array");
  }

  return {
    content: choice.message.content ?? null,
    tool_calls: choice.message.tool_calls,
    usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
    model: data.model,
  };
}

export async function llmStructured<T>(opts: {
  model?: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: JSONSchema7;
  max_tokens?: number;
  temperature?: number;
  validate?: (raw: unknown) => T;
}): Promise<T> {
  const result = await llmCall({
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.max_tokens,
    temperature: opts.temperature,
    responseFormat: {
      schemaName: opts.schemaName,
      schema: opts.schema,
    },
  });

  if (!result.content) {
    throw new Error("Structured output: empty content returned");
  }

  const parsed = parseJsonContent(result.content);
  if (opts.validate) {
    return opts.validate(parsed);
  }
  return parsed as T;
}

export async function llmJson<T>(opts: {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  validate: (raw: unknown) => T;
  retries?: number;
}): Promise<T> {
  const retries = opts.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await llmCall({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.max_tokens,
        temperature: opts.temperature,
        responseFormat: { type: "json_object" },
      });

      if (!result.content) {
        throw new Error("JSON output: empty content returned");
      }

      const parsed = parseJsonContent(result.content);
      return opts.validate(parsed);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function llmVision(
  imageBase64: string,
  mediaType: "image/png" | "image/jpeg" | "image/webp",
  prompt: string,
  model = MODELS.PRIMARY,
): Promise<string> {
  const res = await llmCall({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mediaType};base64,${imageBase64}` },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    max_tokens: 1024,
  });

  return res.content ?? "";
}

export async function openRouterHealthCheck(): Promise<boolean> {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      return false;
    }
    const res = await llmCall({
      model: MODELS.FAST,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 8,
      temperature: 0,
    });
    return Boolean(res.content);
  } catch {
    return false;
  }
}
