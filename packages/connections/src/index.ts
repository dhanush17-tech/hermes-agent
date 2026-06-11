export * from "./types.js";
export * from "./providers.js";
export * from "./store.js";
export * from "./client.js";
export * from "./oauth.js";
export * from "./token.js";
export * from "./connect.js";
export * from "./request.js";

/** A redacted view of a connection, safe to show the user / agent. */
import type { StoredConnection } from "./types.js";
export function describeConnection(conn: StoredConnection): Record<string, unknown> {
  return {
    provider: conn.provider,
    account: conn.account,
    scheme: conn.scheme,
    connected: Boolean(conn.access_token || conn.api_key || conn.password),
    expiresAt: conn.expires_at ?? null,
    scope: conn.scope ?? null,
    createdAt: conn.created_at,
  };
}
