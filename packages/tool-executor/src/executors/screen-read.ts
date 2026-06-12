import type { CloudflareWorkersAIClient, ToolResult } from "@hermes-os/shared";
import { prepareVisionImage } from "../prepare-vision-image.js";
import { executeScreenObserve } from "./screen-observe.js";

export async function executeScreenRead(
  payload: unknown,
  workspaceRoot: string,
  cf: CloudflareWorkersAIClient | null,
): Promise<ToolResult> {
  const body = payload as { service?: string; instruction?: string };
  const service = body.service?.trim() || "current screen";
  const instruction =
    body.instruction?.trim() ||
    "Read the visible screen text and summarize the important messages or actionable items.";

  const capture = await executeScreenObserve(workspaceRoot);
  if (capture.status !== "success") return capture;

  const capturePath = (capture.data as { capturePath?: string }).capturePath;
  if (!capturePath) return { status: "denied", reason: "screen capture did not produce a file" };

  if (!cf) {
    return {
      status: "denied",
      reason:
        "screen.read requires vision configuration. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or use browser.observe on a Playwright page with readable DOM.",
    };
  }

  try {
    const prepared = await prepareVisionImage(capturePath);
    const prompt = [
      `The user wants information from ${service}, but the screenshot may show a different app.`,
      "First identify the visible app or surface.",
      "If the screenshot shows Hermes, Personal OS, Agent Activity, or this assistant chat instead of the requested app, say the requested app is not visible.",
      instruction,
      "Only report text and facts that are visibly present in the screenshot.",
      "If the requested channel, DM, or message text is not visible, say exactly that.",
      "For chat apps, include visible sender names, timestamps if visible, and message text. Do not infer unseen messages.",
    ].join(" ");
    const text = await cf.analyzeImageBuffer(prepared.buffer, prepared.mimeType, {
      prompt,
      maxTokens: 900,
    });
    if (!text.trim()) return { status: "denied", reason: "vision returned no readable text" };
    return {
      status: "success",
      data: {
        service,
        instruction,
        capturePath,
        visibleText: text.trim().slice(0, 12_000),
      },
    };
  } catch (err) {
    return {
      status: "denied",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
