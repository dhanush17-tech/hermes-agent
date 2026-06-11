import { getProvider } from "./providers.js";
import { connectOAuth, type ConnectResult } from "./oauth.js";
import { saveConnection } from "./store.js";
import type { StoredConnection } from "./types.js";

export type ConnectInput = {
  provider: string;
  account: string;
  /** For apikey/bearer providers: the key to store. */
  apiKey?: string;
  /** For basic providers. */
  username?: string;
  password?: string;
  openBrowser?: boolean;
};

/**
 * Connect an account for a provider. OAuth2 providers run the local loopback
 * flow; apikey/bearer/basic providers just store the supplied secret.
 */
export async function connect(input: ConnectInput): Promise<ConnectResult> {
  const provider = getProvider(input.provider);
  if (!provider) return { ok: false, reason: `Unknown provider: ${input.provider}` };

  if (provider.scheme === "oauth2") {
    return connectOAuth(provider, input.account, { openBrowser: input.openBrowser });
  }

  if (provider.scheme === "apikey" || provider.scheme === "bearer") {
    if (!input.apiKey) return { ok: false, reason: `apiKey required for ${provider.id}` };
    const connection: StoredConnection = {
      provider: provider.id,
      account: input.account,
      scheme: provider.scheme,
      api_key: input.apiKey,
      created_at: new Date().toISOString(),
    };
    saveConnection(connection);
    return { ok: true, connection };
  }

  // basic
  if (!input.username || !input.password) {
    return { ok: false, reason: `username and password required for ${provider.id}` };
  }
  const connection: StoredConnection = {
    provider: provider.id,
    account: input.account,
    scheme: "basic",
    username: input.username,
    password: input.password,
    created_at: new Date().toISOString(),
  };
  saveConnection(connection);
  return { ok: true, connection };
}
