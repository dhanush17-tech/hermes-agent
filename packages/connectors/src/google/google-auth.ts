import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type GoogleTokenFile = {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expires_at?: string;
  obtained_at?: string;
};

type OAuthClientConfig = {
  client_id: string;
  client_secret: string;
};

const DEFAULT_TOKEN_PATH = join(homedir(), ".hermes", "secrets", "google-oauth-tokens.json");
const DEFAULT_CLIENT_PATH = join(homedir(), ".hermes", "secrets", "google-oauth-client.json");

function resolveTokenPath(): string {
  return process.env.GOOGLE_OAUTH_TOKEN_PATH ?? DEFAULT_TOKEN_PATH;
}

function resolveClientPath(): string {
  return process.env.GOOGLE_OAUTH_CLIENT_PATH ?? DEFAULT_CLIENT_PATH;
}

function loadClientConfig(): OAuthClientConfig | null {
  const path = resolveClientPath();
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    installed?: OAuthClientConfig;
    web?: OAuthClientConfig;
  };
  return raw.installed ?? raw.web ?? null;
}

function loadTokenFile(): GoogleTokenFile | null {
  const path = resolveTokenPath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as GoogleTokenFile;
}

function saveTokenFile(tokens: GoogleTokenFile): void {
  writeFileSync(resolveTokenPath(), JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

function isExpired(tokens: GoogleTokenFile): boolean {
  if (!tokens.expires_at) return false;
  return new Date(tokens.expires_at).getTime() <= Date.now() + 60_000;
}

async function refreshAccessToken(
  client: OAuthClientConfig,
  refreshToken: string,
): Promise<GoogleTokenFile> {
  const body = new URLSearchParams({
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Token refresh failed");
  }
  const existing = loadTokenFile();
  const updated: GoogleTokenFile = {
    access_token: data.access_token,
    refresh_token: existing?.refresh_token ?? refreshToken,
    scope: existing?.scope,
    token_type: "Bearer",
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    obtained_at: new Date().toISOString(),
  };
  saveTokenFile(updated);
  return updated;
}

/** Returns a valid Google access token from env or ~/.hermes/secrets token file. */
export async function getGoogleAccessToken(): Promise<string | null> {
  const envToken = process.env.GMAIL_ACCESS_TOKEN?.trim();
  if (envToken && envToken !== "..." && !envToken.startsWith("your_")) {
    return envToken;
  }

  const tokens = loadTokenFile();
  if (!tokens?.access_token) return null;

  if (!isExpired(tokens)) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    return tokens.access_token;
  }

  const client = loadClientConfig();
  if (!client) return tokens.access_token;

  try {
    const refreshed = await refreshAccessToken(client, tokens.refresh_token);
    process.env.GMAIL_ACCESS_TOKEN = refreshed.access_token;
    return refreshed.access_token;
  } catch {
    return tokens.access_token;
  }
}

export function hasGoogleOAuthConfigured(): boolean {
  const envToken = process.env.GMAIL_ACCESS_TOKEN?.trim();
  if (envToken && envToken !== "..." && !envToken.startsWith("your_")) return true;
  return existsSync(resolveTokenPath());
}
