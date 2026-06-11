import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderConfig } from "./types.js";

/**
 * Built-in provider blueprints. Adding a service is a config entry here plus a
 * one-time OAuth-app registration in that provider's console (for oauth2) or an
 * API key (for apikey). This is the local stand-in for Composio's auth configs.
 */
export const BUILTIN_PROVIDERS: ProviderConfig[] = [
  {
    id: "google",
    label: "Google (Gmail + Calendar)",
    scheme: "oauth2",
    apiBaseUrl: "https://www.googleapis.com",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    clientFileEnv: "GOOGLE_OAUTH_CLIENT_PATH",
    clientFileDefault: join(homedir(), ".hermes", "secrets", "google-oauth-client.json"),
  },
  {
    id: "github",
    label: "GitHub",
    scheme: "oauth2",
    apiBaseUrl: "https://api.github.com",
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "user:email"],
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
  },
  {
    id: "slack",
    label: "Slack",
    scheme: "oauth2",
    apiBaseUrl: "https://slack.com/api",
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read", "users:read"],
    clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
    clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
  },
  {
    id: "notion",
    label: "Notion",
    scheme: "oauth2",
    apiBaseUrl: "https://api.notion.com",
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdEnv: "NOTION_OAUTH_CLIENT_ID",
    clientSecretEnv: "NOTION_OAUTH_CLIENT_SECRET",
  },
  {
    id: "linear",
    label: "Linear",
    scheme: "oauth2",
    apiBaseUrl: "https://api.linear.app",
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write"],
    clientIdEnv: "LINEAR_OAUTH_CLIENT_ID",
    clientSecretEnv: "LINEAR_OAUTH_CLIENT_SECRET",
  },
  {
    id: "openai",
    label: "OpenAI (API key)",
    scheme: "apikey",
    apiBaseUrl: "https://api.openai.com",
  },
];

const REGISTRY = new Map<string, ProviderConfig>(BUILTIN_PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: string): ProviderConfig | null {
  return REGISTRY.get(id.toLowerCase().trim()) ?? null;
}

export function listProviders(): ProviderConfig[] {
  return [...REGISTRY.values()];
}

/** Register or override a provider at runtime (e.g. from a self-edited tool). */
export function registerProvider(config: ProviderConfig): void {
  REGISTRY.set(config.id.toLowerCase().trim(), config);
}
