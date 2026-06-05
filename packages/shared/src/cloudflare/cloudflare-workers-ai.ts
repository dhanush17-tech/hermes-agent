import type { RequestClassification } from "../types.js";
import { sanitizeAssistantReply } from "../reply-sanitize.js";
import {
  DEFAULT_VISION_MODEL,
  extractVisionError,
  extractVisionText,
  type CloudflareRunResult,
} from "./vision-image.js";
import { ModelRouter, loadCloudflareModelRoutes } from "./model-router.js";

export type CloudflareChatOptions = {
  model?: string;
  classification?: RequestClassification;
  maxTokens?: number;
  system?: string;
  /** Prior user/assistant turns (current user message is passed separately). */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

export class CloudflareWorkersAIClient {
  private readonly router: ModelRouter;
  private visionLicenseAgreed = false;

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    routesConfigPath?: string,
  ) {
    this.router = new ModelRouter(loadCloudflareModelRoutes(routesConfigPath));
  }

  get baseUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/v1`;
  }

  resolveModel(classification: RequestClassification): string {
    return this.router.resolve(classification);
  }

  /** Vision via Workers AI /ai/run (Llama 3.2 Vision). Resizes should be done before call. */
  async chatWithImage(
    imageBase64: string,
    mimeType: string,
    opts: CloudflareChatOptions & { prompt?: string } = {},
  ): Promise<string> {
    const buffer = Buffer.from(imageBase64, "base64");
    return this.analyzeImageBuffer(buffer, mimeType, opts);
  }

  async analyzeImageBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    opts: CloudflareChatOptions & { prompt?: string } = {},
  ): Promise<string> {
    const model = opts.model ?? DEFAULT_VISION_MODEL;
    const prompt = opts.prompt ?? "Describe this screenshot in detail.";
    const userText = opts.system ? `${opts.system}\n\n${prompt}` : prompt;

    await this.ensureVisionLicense(model);

    const imageArray = [...new Uint8Array(imageBuffer)];

    const runBody = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
              },
            },
          ],
        },
      ],
      max_tokens: opts.maxTokens ?? 512,
      temperature: 0.2,
    };

    let text = await this.postVisionRun(model, runBody);
    if (text) return text;

    const legacyBody = {
      prompt: userText,
      image: imageArray,
      max_tokens: opts.maxTokens ?? 512,
      temperature: 0.2,
    };
    text = await this.postVisionRun(model, legacyBody);
    if (text) return text;

    text = await this.postVisionChatCompletions(model, imageBuffer, mimeType, userText, opts);
    if (text) return text;

    throw new Error("Vision model returned empty response");
  }

  private async ensureVisionLicense(model: string): Promise<void> {
    if (this.visionLicenseAgreed || !model.includes("llama-3.2-11b-vision")) return;
    try {
      await this.postVisionRun(model, { prompt: "agree" }, { allowAgreement403: true });
    } catch {
      /* may already be agreed */
    }
    this.visionLicenseAgreed = true;
  }

  private visionRunUrl(model: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;
  }

  private async postVisionRun(
    model: string,
    body: Record<string, unknown>,
    opts: { allowAgreement403?: boolean } = {},
  ): Promise<string> {
    const res = await fetch(this.visionRunUrl(model), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const raw = await res.text();
    let data: CloudflareRunResult = {};
    try {
      data = JSON.parse(raw) as CloudflareRunResult;
    } catch {
      if (!res.ok) throw new Error(extractVisionError({}, res.status, raw));
    }

    if (
      opts.allowAgreement403 &&
      res.status === 403 &&
      /model agreement|thank you for agreeing/i.test(raw)
    ) {
      return "";
    }

    const text = extractVisionText(data);
    if (text) return text;

    if (!res.ok || data.success === false) {
      throw new Error(extractVisionError(data, res.status, raw));
    }

    return "";
  }

  private async postVisionChatCompletions(
    model: string,
    imageBuffer: Buffer,
    mimeType: string,
    userText: string,
    opts: CloudflareChatOptions,
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
                },
              },
            ],
          },
        ],
        max_tokens: opts.maxTokens ?? 512,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudflare vision chat ${res.status}: ${body.slice(0, 280)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
    };
    const msg = data.choices?.[0]?.message;
    return extractChatText(msg?.content, msg?.reasoning);
  }

  async chat(userMessage: string, opts: CloudflareChatOptions = {}): Promise<string> {
    const model =
      opts.model ??
      (opts.classification
        ? this.router.resolve(opts.classification)
        : this.router.resolve("unknown"));

    const messages: Array<{ role: string; content: string }> = [];
    if (opts.system) {
      messages.push({ role: "system", content: opts.system });
    }
    for (const turn of opts.history ?? []) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: "user", content: userMessage });

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: opts.maxTokens ?? 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cloudflare AI ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; reasoning?: string | null } }>;
    };
    const msg = data.choices?.[0]?.message;
    return extractChatText(msg?.content, msg?.reasoning);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.chat("ping", {
        model: "@cf/zai-org/glm-4.7-flash",
        maxTokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export function createCloudflareClientFromEnv(): CloudflareWorkersAIClient | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  return new CloudflareWorkersAIClient(accountId, token);
}

function extractChatText(content: unknown, reasoning: unknown): string {
  const contentText = normalizeMessageText(content);
  if (contentText) return sanitizeAssistantReply(contentText);
  const reasoningText = normalizeMessageText(reasoning);
  if (reasoningText) return sanitizeAssistantReply(reasoningText);
  return "";
}

function normalizeMessageText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}
