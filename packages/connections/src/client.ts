import { readFileSync, existsSync } from "node:fs";
import type { ClientCreds, ProviderConfig } from "./types.js";

/**
 * Loads OAuth client credentials for a provider. Prefers a client JSON file
 * (Google-style `{installed|web:{client_id,client_secret}}`); otherwise reads
 * the configured env vars. Returns null when neither is available.
 */
export function loadClientCreds(provider: ProviderConfig): ClientCreds | null {
  const filePath = provider.clientFileEnv
    ? process.env[provider.clientFileEnv] ?? provider.clientFileDefault
    : provider.clientFileDefault;
  if (filePath && existsSync(filePath)) {
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
        installed?: ClientCreds;
        web?: ClientCreds;
        client_id?: string;
        client_secret?: string;
      };
      const cfg = raw.installed ?? raw.web ?? (raw.client_id ? (raw as ClientCreds) : null);
      if (cfg?.client_id && cfg?.client_secret) return cfg;
    } catch {
      /* fall through to env */
    }
  }
  const id = provider.clientIdEnv ? process.env[provider.clientIdEnv]?.trim() : undefined;
  const secret = provider.clientSecretEnv
    ? process.env[provider.clientSecretEnv]?.trim()
    : undefined;
  if (id && secret) return { client_id: id, client_secret: secret };
  return null;
}
