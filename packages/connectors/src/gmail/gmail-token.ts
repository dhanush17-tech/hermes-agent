import { readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expandPath, resolveAccountTokenPath, type GoogleAccountConfig } from "./gmail-auth.js";

export type GmailTokenFile = {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  token?: string;
  expiry_date?: number;
  expires_at?: string;
  scope?: string;
  token_type?: string;
};

function defaultClientPath(): string {
  return process.env.GOOGLE_OAUTH_CLIENT_PATH ?? join(homedir(), ".hermes", "secrets", "google-oauth-client.json");
}

function loadOAuthClient(): { client_id: string; client_secret: string } | null {
  const path = defaultClientPath();
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    installed?: { client_id: string; client_secret: string };
    web?: { client_id: string; client_secret: string };
  };
  return raw.installed ?? raw.web ?? null;
}

function isExpired(tokens: GmailTokenFile): boolean {
  if (tokens.expiry_date) {
    return tokens.expiry_date <= Date.now() + 60_000;
  }
  if (tokens.expires_at) {
    return new Date(tokens.expires_at).getTime() <= Date.now() + 60_000;
  }
  return false;
}

async function refreshTokenFile(
  tokenPath: string,
  tokens: GmailTokenFile,
): Promise<GmailTokenFile | null> {
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) return null;

  const client = tokens.client_id && tokens.client_secret
    ? { client_id: tokens.client_id, client_secret: tokens.client_secret }
    : loadOAuthClient();
  if (!client) return null;

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
  };
  if (!res.ok || !data.access_token) return null;

  const updated: GmailTokenFile = {
    ...tokens,
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
    expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
  };
  await writeFile(expandPath(tokenPath), JSON.stringify(updated, null, 2), { mode: 0o600 });
  return updated;
}

export async function readAccountTokenWithRefresh(tokenPath: string): Promise<string | null> {
  try {
    const raw = await readFile(expandPath(tokenPath), "utf8");
    let tokens = JSON.parse(raw) as GmailTokenFile;
    const access = tokens.access_token ?? tokens.token;
    if (!access) return null;
    if (!isExpired(tokens)) return access;

    const refreshed = await refreshTokenFile(tokenPath, tokens);
    if (refreshed?.access_token) return refreshed.access_token;
    return access;
  } catch {
    return null;
  }
}

export async function testGmailApiAccess(token: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "oauth_required" };
    }
    return { ok: false, reason: `Gmail API ${res.status}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function tokenForAccountWithRefresh(
  accounts: GoogleAccountConfig[],
  accountId: string,
): Promise<{ token: string | null; refreshMissing: boolean }> {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return { token: null, refreshMissing: false };

  const tokenPath = resolveAccountTokenPath(account);
  try {
    const raw = await readFile(tokenPath, "utf8");
    const tokens = JSON.parse(raw) as GmailTokenFile;
    if (!tokens.access_token && !tokens.token) {
      return { token: null, refreshMissing: !tokens.refresh_token };
    }
    const token = await readAccountTokenWithRefresh(tokenPath);
    return { token, refreshMissing: !tokens.refresh_token && !token };
  } catch {
    return { token: null, refreshMissing: true };
  }
}
