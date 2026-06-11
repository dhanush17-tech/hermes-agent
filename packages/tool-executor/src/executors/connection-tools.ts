import type { ToolResult } from "@hermes-os/shared";
import {
  connect,
  connectionRequest,
  describeConnection,
  getProvider,
  listConnections,
  listProviders,
  removeConnection,
} from "@hermes-os/connections";

/** List available providers and currently-connected accounts. */
export async function executeConnectionList(): Promise<ToolResult> {
  const providers = listProviders().map((p) => ({ id: p.id, label: p.label, scheme: p.scheme }));
  const connections = listConnections().map(describeConnection);
  return { status: "success", data: { providers, connections } };
}

/** Connect a provider account: OAuth loopback flow, or store an API key. */
export async function executeConnectionConnect(payload: unknown): Promise<ToolResult> {
  const body = payload as {
    provider?: string;
    account?: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };
  if (!body.provider) return { status: "denied", reason: "provider required" };
  const provider = getProvider(body.provider);
  if (!provider) return { status: "denied", reason: `Unknown provider: ${body.provider}` };
  const account = body.account ?? "default";

  const result = await connect({
    provider: body.provider,
    account,
    apiKey: body.apiKey,
    username: body.username,
    password: body.password,
  });
  if (!result.ok) {
    const hint = result.authorizeUrl ? ` Authorize here: ${result.authorizeUrl}` : "";
    return { status: "denied", reason: `${result.reason}${hint}` };
  }
  return {
    status: "success",
    data: { connected: describeConnection(result.connection) },
  };
}

/** Remove a stored connection. */
export async function executeConnectionRemove(payload: unknown): Promise<ToolResult> {
  const body = payload as { provider?: string; account?: string };
  if (!body.provider || !body.account) {
    return { status: "denied", reason: "provider and account required" };
  }
  const removed = removeConnection(body.provider, body.account);
  return removed
    ? { status: "success", data: { removed: `${body.provider}/${body.account}` } }
    : { status: "denied", reason: "connection not found" };
}

/** Make an authenticated API call against a connected provider. */
export async function executeConnectionRequest(payload: unknown): Promise<ToolResult> {
  const body = payload as {
    provider?: string;
    account?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
  };
  if (!body.provider || !body.url) {
    return { status: "denied", reason: "provider and url required" };
  }
  try {
    // The HTTP call executed; a non-2xx status is returned as data so the agent
    // can read the error body and decide what to do (only thrown errors deny).
    const res = await connectionRequest({
      provider: body.provider,
      account: body.account,
      method: body.method,
      url: body.url,
      headers: body.headers,
      query: body.query,
      body: body.body,
    });
    return { status: "success", data: res };
  } catch (err) {
    return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
  }
}
