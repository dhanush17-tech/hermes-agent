import { randomUUID } from "node:crypto";

export type OneTimeSecret = {
  id: string;
  service: string;
  account: string;
  encryptedValue: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
};

const TTL_MS = 60_000;
const secrets = new Map<string, OneTimeSecret>();

/** In-memory one-time secret store — never persisted or logged. */
export class CredentialVault {
  store(service: string, account: string, value: string): string {
    const id = `pwd_${randomUUID().slice(0, 12)}`;
    const now = Date.now();
    const entry: OneTimeSecret = {
      id,
      service,
      account,
      encryptedValue: Buffer.from(value, "utf8").toString("base64"),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + TTL_MS).toISOString(),
      used: false,
    };
    secrets.set(id, entry);
    return id;
  }

  consume(id: string, account: string): string | null {
    const entry = secrets.get(id);
    if (!entry || entry.used) return null;
    if (entry.account.toLowerCase() !== account.toLowerCase()) return null;
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
      secrets.delete(id);
      return null;
    }
    entry.used = true;
    secrets.delete(id);
    return Buffer.from(entry.encryptedValue, "base64").toString("utf8");
  }

  clear(id: string): void {
    secrets.delete(id);
  }

  /** Test helper */
  _size(): number {
    return secrets.size;
  }
}

export const globalCredentialVault = new CredentialVault();
