import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import { prepareVisionImage } from "./prepare-vision-image.js";

export type ScreenContextAnalysis = {
  summary: string;
  openLoops: string[];
  risks: string[];
  raw?: string;
  visionDescription?: string;
};

const STRUCTURE_PROMPT = `Given this screen description from the user's Mac, extract operational facts.
Reply ONLY valid JSON (no markdown):
{"summary":"2-4 sentences","openLoops":["concrete action items visible"],"risks":["things that could go wrong"]}
If nothing actionable, use empty arrays. Do not invent names not in the description.`;

export async function analyzeScreenForContext(
  capturePath: string,
  service: string,
  cf: CloudflareWorkersAIClient | null,
): Promise<ScreenContextAnalysis> {
  if (!capturePath) {
    return { summary: `No screen capture for ${service}.`, openLoops: [], risks: [] };
  }
  if (!cf) {
    return {
      summary: `Captured ${service} (set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN for vision).`,
      openLoops: [],
      risks: [],
    };
  }

  let prepared;
  try {
    prepared = await prepareVisionImage(capturePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      summary: `Could not read screenshot for ${service}: ${msg}`,
      openLoops: [],
      risks: [],
    };
  }

  const describePrompt = [
    `This is a screenshot of the user's ${service} in a web browser (Arc on macOS).`,
    "Describe everything useful for a personal assistant:",
    "- unread or important messages, sender names if visible",
    "- deadlines, event names, errors, login walls",
    "- anything waiting for the user to reply or act",
    "Be specific and factual. Plain text only, no JSON.",
  ].join(" ");

  let visionDescription: string;
  try {
    visionDescription = await cf.analyzeImageBuffer(prepared.buffer, prepared.mimeType, {
      prompt: describePrompt,
      maxTokens: 600,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      summary: `Vision API failed for ${service}: ${msg}`,
      openLoops: [],
      risks: [],
    };
  }

  if (!visionDescription.trim()) {
    return {
      summary: `Vision returned empty for ${service}. Check CLOUDFLARE_VISION_MODEL and account Workers AI access.`,
      openLoops: [],
      risks: [],
      visionDescription,
    };
  }

  try {
    const structuredRaw = await cf.chat(
      `${STRUCTURE_PROMPT}\n\nScreen description:\n${visionDescription.slice(0, 3500)}`,
      { classification: "personal_ops", maxTokens: 500 },
    );

    const parsed = parseStructuredJson(structuredRaw);
    if (parsed) {
      return {
        summary: parsed.summary || visionDescription.slice(0, 400),
        openLoops: parsed.openLoops ?? [],
        risks: parsed.risks ?? [],
        raw: structuredRaw,
        visionDescription,
      };
    }

    return {
      summary: visionDescription.slice(0, 500),
      openLoops: [],
      risks: [],
      raw: structuredRaw,
      visionDescription,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      summary: visionDescription.slice(0, 500),
      openLoops: [],
      risks: [],
      visionDescription,
      raw: `structure failed: ${msg}`,
    };
  }
}

function parseStructuredJson(
  raw: string,
): { summary?: string; openLoops?: string[]; risks?: string[] } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: string;
      openLoops?: unknown;
      risks?: unknown;
    };
    return {
      summary: typeof data.summary === "string" ? data.summary : undefined,
      openLoops: Array.isArray(data.openLoops) ? data.openLoops.map(String) : [],
      risks: Array.isArray(data.risks) ? data.risks.map(String) : [],
    };
  } catch {
    return null;
  }
}
