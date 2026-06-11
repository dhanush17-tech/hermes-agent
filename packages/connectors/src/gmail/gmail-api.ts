import { type GoogleAccountConfig } from "./gmail-auth.js";
import { getValidAccountToken } from "../google/google-account-token.js";

export type GmailListResponse = { messages?: Array<{ id: string; threadId: string }> };

export type GmailMessageResponse = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
  };
};

export function header(
  headers: Array<{ name: string; value: string }> | undefined,
  name: string,
): string {
  return headers?.find((h) => h.name === name)?.value ?? "";
}

export function parseFrom(headers: Array<{ name: string; value: string }> | undefined): string {
  return header(headers, "From") || "unknown";
}

export function parseSubject(headers: Array<{ name: string; value: string }> | undefined): string {
  return header(headers, "Subject") || "(no subject)";
}

export function decodeBody(data?: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function extractBody(msg: GmailMessageResponse): string {
  if (msg.payload?.body?.data) return decodeBody(msg.payload.body.data);
  for (const part of msg.payload?.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeBody(part.body.data);
  }
  return msg.snippet ?? "";
}

export async function tokenForAccount(
  accounts: GoogleAccountConfig[],
  accountId: string,
): Promise<string> {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Unknown Gmail account: ${accountId}`);
  const token = await getValidAccountToken(account);
  if (!token) throw new Error(`No token for ${account.email} at ${account.tokenPath}`);
  return token;
}
