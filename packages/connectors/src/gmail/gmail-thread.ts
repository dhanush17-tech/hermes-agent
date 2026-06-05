import type { GoogleAccountConfig } from "./gmail-auth.js";
import type { EmailThread } from "./types.js";
import {
  extractBody,
  parseFrom,
  parseSubject,
  tokenForAccount,
  type GmailMessageResponse,
} from "./gmail-api.js";

export class GmailThreadReader {
  constructor(private readonly accounts: GoogleAccountConfig[]) {}

  async readThread(accountId: string, threadId: string): Promise<EmailThread | null> {
    const token = await tokenForAccount(this.accounts, accountId);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { messages?: GmailMessageResponse[] };
    const messages = data.messages ?? [];
    if (!messages.length) return null;
    return {
      threadId,
      subject: parseSubject(messages[0]?.payload?.headers),
      messages: messages.map((m) => ({
        from: parseFrom(m.payload?.headers),
        body: extractBody(m),
        date: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  async summarizeThreads(accountId: string, threadIds: string[]): Promise<string[]> {
    const lines: string[] = [];
    for (const id of threadIds.slice(0, 10)) {
      const thread = await this.readThread(accountId, id);
      if (!thread) continue;
      const last = thread.messages.at(-1);
      lines.push(
        `- ${thread.subject}: ${last?.body.slice(0, 160) ?? thread.messages[0]?.body.slice(0, 160)}`,
      );
    }
    return lines;
  }
}
