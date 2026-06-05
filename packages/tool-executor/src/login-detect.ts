import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import { prepareVisionImage } from "./prepare-vision-image.js";

export type LoginScreenAnalysis = {
  loginRequired: boolean;
  service?: string;
  fields?: string[];
  reason?: string;
};

const AUTH_URL_PATTERNS = [
  /accounts\.google\.com/i,
  /login\.microsoftonline\.com/i,
  /signin/i,
  /auth\./i,
  /oauth/i,
  /id\.apple\.com/i,
];

export function urlLikelyNeedsLogin(url: string): boolean {
  return AUTH_URL_PATTERNS.some((p) => p.test(url));
}

export async function analyzeScreenForLogin(
  capturePath: string,
  url: string | null,
  cf: CloudflareWorkersAIClient | null,
): Promise<LoginScreenAnalysis> {
  if (url && urlLikelyNeedsLogin(url)) {
    return {
      loginRequired: true,
      service: inferServiceFromUrl(url),
      fields: ["username", "password"],
      reason: "auth URL",
    };
  }

  if (!cf) {
    return { loginRequired: false, reason: "no vision model" };
  }

  try {
    const { buffer, mimeType } = await prepareVisionImage(capturePath);
    const raw = await cf.analyzeImageBuffer(buffer, mimeType, {
      maxTokens: 200,
      prompt: "Does this screenshot show a login or sign-in form?",
      system:
        'Reply ONLY JSON: {"loginRequired":boolean,"service":"gmail|x|slack|...|unknown","fields":["email","password"]}. loginRequired true if sign-in, login, password, or 2FA prompt is visible.',
    });
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const data = JSON.parse(raw.slice(start, end + 1)) as LoginScreenAnalysis;
      return {
        loginRequired: Boolean(data.loginRequired),
        service: data.service,
        fields: data.fields,
        reason: "vision",
      };
    }
  } catch {
    // fall through
  }

  return { loginRequired: false, reason: "vision inconclusive" };
}

function inferServiceFromUrl(url: string): string {
  if (/google|gmail/i.test(url)) return "gmail";
  if (/twitter|x\.com/i.test(url)) return "x";
  if (/linkedin/i.test(url)) return "linkedin";
  if (/slack/i.test(url)) return "slack";
  if (/notion/i.test(url)) return "notion";
  if (/amazon/i.test(url)) return "amazon";
  if (/github/i.test(url)) return "github";
  return "unknown";
}
