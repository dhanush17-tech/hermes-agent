import type { GoogleAccountConfig } from "./gmail-auth.js";
import type { EmailSummary } from "./types.js";
import {
  GmailListResponse,
  GmailMessageResponse,
  parseFrom,
  parseSubject,
  tokenForAccount,
} from "./gmail-api.js";

export class GmailSearch {
  constructor(private readonly accounts: GoogleAccountConfig[]) {}

  async search(accountId: string, query: string, maxResults = 20): Promise<EmailSummary[]> {
    return this.fetchMessages(accountId, `q=${encodeURIComponent(query)}&maxResults=${maxResults}`);
  }

  async getRecent(accountId: string, maxResults = 15): Promise<EmailSummary[]> {
    return this.fetchMessages(accountId, `maxResults=${maxResults}`);
  }

  async getUnread(accountId: string, maxResults = 15): Promise<EmailSummary[]> {
    return this.fetchMessages(accountId, `q=is:unread+newer_than:7d&maxResults=${maxResults}`);
  }

  private async fetchMessages(accountId: string, querySuffix: string): Promise<EmailSummary[]> {
    const token = await tokenForAccount(this.accounts, accountId);
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${querySuffix}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
    const list = (await listRes.json()) as GmailListResponse;
    const summaries: EmailSummary[] = [];
    for (const msg of list.messages ?? []) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!detailRes.ok) continue;
      const detail = (await detailRes.json()) as GmailMessageResponse;
      summaries.push({
        id: detail.id,
        threadId: msg.threadId,
        subject: parseSubject(detail.payload?.headers),
        from: parseFrom(detail.payload?.headers),
        snippet: detail.snippet ?? "",
        receivedAt: detail.internalDate
          ? new Date(Number(detail.internalDate)).toISOString()
          : undefined,
      });
    }
    return summaries;
  }
}
