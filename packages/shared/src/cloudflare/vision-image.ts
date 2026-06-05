export const DEFAULT_VISION_MODEL =
  process.env.CLOUDFLARE_VISION_MODEL ?? "@cf/meta/llama-3.2-11b-vision-instruct";

export type CloudflareRunResult = {
  success?: boolean;
  result?: {
    response?: string;
    description?: string;
    tool_calls?: unknown[];
  };
  errors?: Array<{ message?: string }>;
};

export function extractVisionText(data: CloudflareRunResult): string {
  const r = data.result;
  if (typeof r?.response === "string" && r.response.trim()) return r.response.trim();
  if (typeof r?.description === "string" && r.description.trim()) return r.description.trim();
  return "";
}

export function extractVisionError(data: CloudflareRunResult, status: number, body: string): string {
  const msg = data.errors?.[0]?.message;
  if (msg) return msg;
  if (body) return `HTTP ${status}: ${body.slice(0, 280)}`;
  return `HTTP ${status}`;
}
