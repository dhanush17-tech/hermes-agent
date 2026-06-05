import type { GoogleAccountConfig } from "./gmail-auth.js";
import { tokenForAccount } from "./gmail-api.js";

export class GmailDrafts {
  constructor(private readonly accounts: GoogleAccountConfig[]) {}

  async createDraft(accountId: string, threadId: string, body: string): Promise<{ draftId: string }> {
    const token = await tokenForAccount(this.accounts, accountId);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { threadId, raw: Buffer.from(body).toString("base64url") } }),
    });
    if (!res.ok) throw new Error(`Gmail draft ${res.status}`);
    const data = (await res.json()) as { id?: string };
    return { draftId: data.id ?? "unknown" };
  }

  /** Sends an existing draft — caller must obtain approval (gmail.send_draft policy). */
  async sendDraft(
    accountId: string,
    draftId: string,
    _capabilityLease?: string,
  ): Promise<{ messageId: string }> {
    const token = await tokenForAccount(this.accounts, accountId);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}/send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) throw new Error(`Gmail send draft ${res.status}`);
    const data = (await res.json()) as { id?: string };
    return { messageId: data.id ?? "unknown" };
  }
}
