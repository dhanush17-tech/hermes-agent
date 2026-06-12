import type { ProviderConfig, StoredConnection } from "./types.js";
import { loadClientCreds } from "./client.js";
import { saveConnection } from "./store.js";

function isExpired(conn: StoredConnection): boolean {
  if (!conn.expires_at) return false;
  return new Date(conn.expires_at).getTime() <= Date.now() + 60_000;
}

/**
 * Returns a currently-valid OAuth access token for a connection, refreshing and
 * persisting it when expired. Mirrors Composio's automatic token refresh.
 */
export async function getValidAccessToken(
  provider: ProviderConfig,
  conn: StoredConnection,
): Promise<string | null> {
  if (conn.scheme !== "oauth2") return conn.access_token ?? null;
  if (!conn.access_token) return null;
  if (!isExpired(conn)) return conn.access_token;
  if (!conn.refresh_token || !provider.tokenUrl) return conn.access_token;

  const client = loadClientCreds(provider);
  if (!client) return conn.access_token;

  try {
    const body = new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    });
    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) return conn.access_token;
    const updated: StoredConnection = {
      ...conn,
      access_token: data.access_token,
      expires_at: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    };
    saveConnection(updated);
    return updated.access_token ?? null;
  } catch {
    return conn.access_token;
  }
}
