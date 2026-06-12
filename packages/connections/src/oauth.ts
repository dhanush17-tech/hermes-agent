import { createServer } from "node:http";
import { execFile } from "node:child_process";
import type { ClientCreds, ProviderConfig, StoredConnection } from "./types.js";
import { loadClientCreds } from "./client.js";
import { saveConnection } from "./store.js";

export type ConnectResult =
  | { ok: true; connection: StoredConnection }
  | { ok: false; reason: string; authorizeUrl?: string };

const DEFAULT_PORT = Number(process.env.CONNECTIONS_OAUTH_PORT ?? 8765);

function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function buildAuthorizeUrl(
  provider: ProviderConfig,
  client: ClientCreds,
  redirect: string,
): string {
  const url = new URL(provider.authorizeUrl!);
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  if (provider.scopes?.length) url.searchParams.set("scope", provider.scopes.join(" "));
  for (const [k, v] of Object.entries(provider.extraAuthParams ?? {})) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function exchangeCode(
  provider: ProviderConfig,
  client: ClientCreds,
  code: string,
  redirect: string,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const res = await fetch(provider.tokenUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(text)); // GitHub returns form-encoded
  }
  if (!res.ok || data.error) {
    throw new Error(String(data.error_description ?? data.error ?? `Token exchange ${res.status}`));
  }
  return data;
}

function toConnection(
  provider: ProviderConfig,
  account: string,
  data: Record<string, unknown>,
): StoredConnection {
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
  return {
    provider: provider.id,
    account,
    scheme: "oauth2",
    access_token: data.access_token as string | undefined,
    refresh_token: data.refresh_token as string | undefined,
    scope: data.scope as string | undefined,
    expires_at: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined,
    created_at: new Date().toISOString(),
  };
}

/**
 * Runs the local loopback OAuth flow: opens the provider's authorize page in the
 * browser, captures the callback code on 127.0.0.1, exchanges it for tokens, and
 * stores the connection. The local equivalent of a Composio "connection request".
 */
export async function connectOAuth(
  provider: ProviderConfig,
  account: string,
  opts: { port?: number; openBrowser?: boolean } = {},
): Promise<ConnectResult> {
  if (provider.scheme !== "oauth2") {
    return { ok: false, reason: `${provider.id} is not an oauth2 provider` };
  }
  const client = loadClientCreds(provider);
  if (!client) {
    return {
      ok: false,
      reason: `No OAuth client for ${provider.id}. Set ${
        provider.clientIdEnv ?? "the client file"
      }/${provider.clientSecretEnv ?? ""} or provide ${provider.clientFileDefault ?? "a client file"}.`,
    };
  }
  const port = opts.port ?? DEFAULT_PORT;
  const redirect = redirectUri(port);
  const authorizeUrl = buildAuthorizeUrl(provider, client, redirect);

  return new Promise<ConnectResult>((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", redirect);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
        server.close();
        resolve({ ok: false, reason: error, authorizeUrl });
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Missing authorization code</h1>");
        return;
      }
      try {
        const data = await exchangeCode(provider, client, code, redirect);
        const connection = toConnection(provider, account, data);
        saveConnection(connection);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h1>${provider.label} connected</h1><p>You can close this tab and return to Hermes.</p>`,
        );
        server.close();
        resolve({ ok: true, connection });
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Token exchange failed</h1><pre>${(err as Error).message}</pre>`);
        server.close();
        resolve({ ok: false, reason: (err as Error).message, authorizeUrl });
      }
    });

    server.on("error", (err) =>
      resolve({ ok: false, reason: `Local OAuth server error: ${err.message}`, authorizeUrl }),
    );
    server.listen(port, "127.0.0.1", () => {
      if (opts.openBrowser !== false) {
        execFile("open", [authorizeUrl], () => {});
      }
    });
    setTimeout(
      () => {
        server.close();
        resolve({ ok: false, reason: "OAuth timed out after 5 minutes", authorizeUrl });
      },
      5 * 60 * 1000,
    );
  });
}
