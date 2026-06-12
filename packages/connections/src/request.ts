import { getProvider } from "./providers.js";
import { resolveConnection } from "./store.js";
import { getValidAccessToken } from "./token.js";
import type { StoredConnection, ProviderConfig } from "./types.js";

export type ConnectionRequestInput = {
  provider: string;
  account?: string;
  method?: string;
  /** Absolute URL, or a path resolved against the provider's apiBaseUrl. */
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
};

export type ConnectionRequestResult = {
  status: number;
  ok: boolean;
  data: unknown;
};

async function authHeaders(
  provider: ProviderConfig,
  conn: StoredConnection,
): Promise<Record<string, string>> {
  switch (conn.scheme) {
    case "oauth2":
    case "bearer": {
      const token =
        conn.scheme === "oauth2" ? await getValidAccessToken(provider, conn) : conn.api_key;
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    case "apikey": {
      const header = provider.apiKeyHeader ?? "Authorization";
      const prefix = provider.apiKeyPrefix ?? (header === "Authorization" ? "Bearer " : "");
      return conn.api_key ? { [header]: `${prefix}${conn.api_key}` } : {};
    }
    case "basic": {
      const raw = Buffer.from(`${conn.username ?? ""}:${conn.password ?? ""}`).toString("base64");
      return { Authorization: `Basic ${raw}` };
    }
    default:
      return {};
  }
}

/**
 * Make an authenticated HTTP request against a connected provider's API. This is
 * the generic, Composio-style execution path: any connected service is callable
 * without a bespoke executor.
 */
export async function connectionRequest(
  input: ConnectionRequestInput,
): Promise<ConnectionRequestResult> {
  const provider = getProvider(input.provider);
  if (!provider) throw new Error(`Unknown provider: ${input.provider}`);
  const conn = resolveConnection(provider.id, input.account);
  if (!conn) {
    throw new Error(
      `No connected ${provider.label} account. Connect one first (connection.connect).`,
    );
  }

  const base = provider.apiBaseUrl ?? "";
  const url = new URL(/^https?:\/\//.test(input.url) ? input.url : `${base}${input.url}`);
  for (const [k, v] of Object.entries(input.query ?? {})) url.searchParams.set(k, v);

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(await authHeaders(provider, conn)),
    ...(input.headers ?? {}),
  };

  let body: string | undefined;
  if (input.body !== undefined && input.body !== null) {
    if (typeof input.body === "string") {
      body = input.body;
    } else {
      body = JSON.stringify(input.body);
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
  }

  const res = await fetch(url, {
    method: (input.method ?? "GET").toUpperCase(),
    headers,
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text.slice(0, 20_000);
  }
  return { status: res.status, ok: res.ok, data };
}
