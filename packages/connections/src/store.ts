import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { StoredConnection } from "./types.js";

const DIR = join(homedir(), ".hermes", "secrets", "connections");

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

function safeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._@-]+/g, "_");
}

function fileFor(provider: string, account: string): string {
  return join(DIR, `${safeName(provider)}__${safeName(account)}.json`);
}

export function saveConnection(conn: StoredConnection): void {
  ensureDir();
  writeFileSync(fileFor(conn.provider, conn.account), JSON.stringify(conn, null, 2), {
    mode: 0o600,
  });
}

export function loadConnection(provider: string, account: string): StoredConnection | null {
  const path = fileFor(provider, account);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StoredConnection;
  } catch {
    return null;
  }
}

export function listConnections(provider?: string): StoredConnection[] {
  ensureDir();
  const out: StoredConnection[] = [];
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith(".json")) continue;
    if (provider && !f.startsWith(`${safeName(provider)}__`)) continue;
    try {
      out.push(JSON.parse(readFileSync(join(DIR, f), "utf8")) as StoredConnection);
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

/** Resolve an account for a provider; defaults to the only/first one if unspecified. */
export function resolveConnection(provider: string, account?: string): StoredConnection | null {
  if (account) return loadConnection(provider, account);
  const all = listConnections(provider);
  return all[0] ?? null;
}

export function removeConnection(provider: string, account: string): boolean {
  const path = fileFor(provider, account);
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
