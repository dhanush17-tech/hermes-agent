import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolContext, ToolResult } from "@hermes-os/shared";
import {
  createLoginAssistPlaceholder,
  payloadContainsRawSecret,
  resolvePasswordRef,
} from "@hermes-os/credentials";

export const credentialRequestLoginAssistSchema = z.object({
  service: z.string().optional(),
  email: z.string().email().optional(),
  browser: z.enum(["arc", "playwright"]).optional(),
});

type PendingLoginPayload = {
  service?: string;
  email?: string;
  browser?: "arc" | "playwright";
};

async function readPendingLogin(ctx: ToolContext): Promise<PendingLoginPayload | null> {
  try {
    const raw = await readFile(join(ctx.workspaceRoot, "data", "pending-login.json"), "utf8");
    return JSON.parse(raw) as PendingLoginPayload;
  } catch {
    return null;
  }
}

function findEmailInHistory(ctx: ToolContext): string | undefined {
  for (const turn of [...(ctx.conversationHistory ?? [])].reverse()) {
    const match = turn.content.match(/[\w.+-]+@[\w.-]+\.\w+/);
    if (match?.[0]) return match[0];
  }
  return undefined;
}

export async function executeCredentialRequestLoginAssist(
  payload: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  const parsed = credentialRequestLoginAssistSchema.parse(payload);
  const pending = await readPendingLogin(ctx);
  const body = {
    service: parsed.service ?? pending?.service ?? "gmail",
    email: parsed.email ?? pending?.email ?? findEmailInHistory(ctx),
    browser: parsed.browser ?? pending?.browser ?? "arc",
  };
  if (!body.email) {
    return { status: "denied", reason: "email required for login assist" };
  }
  const sessionId = ctx.approvalId ? `login_${ctx.approvalId}` : `login_${body.email.replace(/[@.]/g, "_")}`;
  return {
    status: "success",
    data: {
      service: body.service,
      email: body.email,
      browser: body.browser,
      sessionId,
      message: `Secure login assist ready for ${body.email} in ${body.browser}.`,
    },
  };
}

export const credentialFillLoginOnceSchema = z.object({
  sessionId: z.string(),
  email: z.string().email(),
  passwordRef: z.string(),
  submit: z.boolean().optional(),
});

export async function executeCredentialFillLoginOnce(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (payloadContainsRawSecret(payload)) {
    return { status: "denied", reason: "Raw password/secret fields are not allowed in tool payloads" };
  }
  const body = credentialFillLoginOnceSchema.parse(payload);
  const password = resolvePasswordRef(body.passwordRef, body.email);
  if (!password) {
    return { status: "denied", reason: "passwordRef expired, used, or invalid" };
  }
  return {
    status: "success",
    data: {
      sessionId: body.sessionId,
      email: body.email,
      filled: true,
      submit: body.submit ?? false,
      note: "Credential consumed and cleared. Complete 2FA manually if prompted.",
    },
  };
}

/** For secure prompt flow after approval — stores one-time ref without logging secret. */
export function storeSecureLoginPassword(
  service: string,
  email: string,
  passwordFromSecurePrompt: string,
): ToolResult {
  const result = createLoginAssistPlaceholder(
    { service, email, browser: "arc" },
    passwordFromSecurePrompt,
  );
  return { status: "success", data: { passwordRef: result.passwordRef, expiresAt: result.expiresAt } };
}
