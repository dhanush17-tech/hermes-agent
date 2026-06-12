import { z } from "zod";
import { fetchArcPageValidated, type ExpectedPageService } from "@hermes-os/browser-control";
import type { ToolResult } from "@hermes-os/shared";

export const browserArcReadSchema = z.object({
  url: z.string().url(),
  expect: z.enum(["gmail", "calendar", "canvas", "twitter", "linkedin", "generic"]).optional(),
  reuseOnly: z.boolean().optional(),
  gmailSessionActive: z.boolean().optional(),
});

export async function executeBrowserArcRead(payload: unknown): Promise<ToolResult> {
  const body = browserArcReadSchema.parse(payload);
  const expect = (body.expect ?? inferService(body.url)) as ExpectedPageService;
  const result = await fetchArcPageValidated(body.url, expect, {
    reuseOnly: body.reuseOnly,
    gmailSessionActive: body.gmailSessionActive,
  });

  if (!result.valid) {
    const detail = [result.reason, result.suggestion].filter(Boolean).join(" — ");
    return {
      status: "denied",
      reason: detail || "page_validation_failed",
    };
  }

  return {
    status: "success",
    data: {
      url: result.url,
      text: result.text.slice(0, 10_000),
      expect,
      retries: result.retries,
    },
  };
}

function inferService(url: string): ExpectedPageService {
  if (/mail\.google/i.test(url)) return "gmail";
  if (/calendar\.google/i.test(url)) return "calendar";
  if (/canvas/i.test(url)) return "canvas";
  if (/x\.com|twitter\.com/i.test(url)) return "twitter";
  if (/linkedin\.com/i.test(url)) return "linkedin";
  return "generic";
}
