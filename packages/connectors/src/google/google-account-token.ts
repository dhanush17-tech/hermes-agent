import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GoogleAccountConfig } from "../gmail/gmail-auth.js";

type OAuthClientConfig = { client_id: string; client_secret: string };

type TokenFile = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_at?: string;
  obtained_at?: string;
};

const DEFAULT_CLIENT_PATH = join(homedir(), ".hermes", "secrets", "google-oauth-client.json");

function loadClientConfig(): OAuthClientConfig | null {
  const path = process.env.GOOGLE_OAUTH_CLIENT_PATH ?? DEFAULT_CLIENT_PATH;
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    installed?: OAuthClientConfig;
    web?: OAuthClientConfig;
  };
  return raw.installed ?? raw.web ?? null;
}

function isExpired(tokens: TokenFile): boolean {
  if (!tokens.expires_at) return false;
  return new Date(tokens.expires_at).getTime() <= Date.now() + 60_000;
}

/**
 * Returns a currently-valid access token for a specific Google account,
 * refreshing it (and persisting the new token back to the account's file)
 * when expired. Unlike readAccountToken this does not silently return a
 * stale, expired token when a refresh is possible.
 */
export async function getValidAccountToken(account: GoogleAccountConfig): Promise<string | null> {
  if (!existsSync(account.tokenPath)) return null;
  let tokens: TokenFile;
  try {
    tokens = JSON.parse(readFileSync(account.tokenPath, "utf8")) as TokenFile;
  } catch {
    return null;
  }
  if (!tokens.access_token) return null;
  if (!isExpired(tokens)) return tokens.access_token;
  if (!tokens.refresh_token) return tokens.access_token;

  const client = loadClientConfig();
  if (!client) return tokens.access_token;

  try {
    const body = new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) return tokens.access_token;
    const updated: TokenFile = {
      ...tokens,
      access_token: data.access_token,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      obtained_at: new Date().toISOString(),
    };
    writeFileSync(account.tokenPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
    return updated.access_token;
  } catch {
    return tokens.access_token;
  }
}
