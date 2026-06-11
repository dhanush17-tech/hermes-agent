export type AuthScheme = "oauth2" | "apikey" | "bearer" | "basic";

/**
 * A provider blueprint — the local equivalent of a Composio "auth config".
 * Describes how to authenticate against one service, for all accounts.
 */
export type ProviderConfig = {
  id: string;
  label: string;
  scheme: AuthScheme;
  /** Base URL used to resolve relative paths in connection.request. */
  apiBaseUrl?: string;

  // --- oauth2 ---
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  /** Extra params appended to the authorize URL (e.g. access_type=offline). */
  extraAuthParams?: Record<string, string>;
  /**
   * Where the OAuth client_id/secret come from. A JSON file path (Google-style
   * `{installed|web:{client_id,client_secret}}`) takes priority, else env vars.
   */
  clientFileEnv?: string;
  clientFileDefault?: string;
  clientIdEnv?: string;
  clientSecretEnv?: string;

  // --- apikey ---
  /** Header used to send an API key (default: Authorization: Bearer). */
  apiKeyHeader?: string;
  /** Prefix for the api key value (default "Bearer " for Authorization). */
  apiKeyPrefix?: string;
};

/** A stored credential — the local equivalent of a Composio "connected account". */
export type StoredConnection = {
  provider: string;
  /** Human label distinguishing accounts of the same provider (e.g. an email). */
  account: string;
  scheme: AuthScheme;
  // oauth2
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string;
  // apikey / bearer
  api_key?: string;
  // basic
  username?: string;
  password?: string;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type ClientCreds = { client_id: string; client_secret: string };
