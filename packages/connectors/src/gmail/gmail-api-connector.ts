import type { Connector, ConnectorScanResult } from "../types.js";
import { getGoogleAccessToken, hasGoogleOAuthConfigured } from "../google/google-auth.js";
import type {
  EmailSummary,
  EmailThread,
  GmailConnectorPort,
  GmailOpenLoop,
  PersonCandidate,
} from "./types.js";

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailMessageResponse = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
  };
};

function header(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  return headers?.find((h) => h.name === name)?.value ?? "";
}

function parseFrom(headers: Array<{ name: string; value: string }> | undefined): string {
  return header(headers, "From") || "unknown";
}

function parseSubject(headers: Array<{ name: string; value: string }> | undefined): string {
  return header(headers, "Subject") || "(no subject)";
}

function decodeBody(data?: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractBody(msg: GmailMessageResponse): string {
  if (msg.payload?.body?.data) return decodeBody(msg.payload.body.data);
  for (const part of msg.payload?.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBody(part.body.data);
    }
  }
  return msg.snippet ?? "";
}

export class GmailApiConnector implements GmailConnectorPort, Connector {
  readonly name = "gmail";

  private async accessToken(): Promise<string> {
    const token = await getGoogleAccessToken();
    if (!token) throw new Error("No Google OAuth token — run: node scripts/google-oauth.mjs");
    return token;
  }

  async search(query: string): Promise<EmailSummary[]> {
    return this.fetchMessages(`q=${encodeURIComponent(query)}&maxResults=20`);
  }

  async getUnreadImportant(): Promise<EmailSummary[]> {
    return this.fetchMessages("q=is:unread+is:important+newer_than:7d&maxResults=15");
  }

  async readThread(threadId: string): Promise<EmailThread | null> {
    const accessToken = await this.accessToken();
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { messages?: GmailMessageResponse[] };
    const messages = data.messages ?? [];
    if (messages.length === 0) return null;
    const subject = parseSubject(messages[0]?.payload?.headers);
    return {
      threadId,
      subject,
      messages: messages.map((m) => ({
        from: parseFrom(m.payload?.headers),
        body: extractBody(m),
        date: m.internalDate
          ? new Date(Number(m.internalDate)).toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  async extractOpenLoops(since: Date): Promise<GmailOpenLoop[]> {
    const sinceSec = Math.floor(since.getTime() / 1000);
    const emails = await this.fetchMessages(
      `q=newer_than:${sinceSec}+(reply OR follow-up OR confirm OR waiting OR rsvp OR deadline)&maxResults=25`,
    );
    return emails
      .filter((e) =>
        /\b(reply|follow.?up|confirm|waiting|rsvp|logistics|deadline)\b/i.test(
          `${e.subject} ${e.snippet}`,
        ),
      )
      .map((e) => ({
        description: `Email from ${e.from}: ${e.subject}`,
        sourceId: e.id,
        owner: "user",
      }));
  }

  async extractPeople(since: Date): Promise<PersonCandidate[]> {
    const sinceSec = Math.floor(since.getTime() / 1000);
    const emails = await this.fetchMessages(`q=newer_than:${sinceSec}&maxResults=30`);
    const seen = new Set<string>();
    const people: PersonCandidate[] = [];
    for (const e of emails) {
      const match = /<?([^<\s]+@[^>\s]+)>?/.exec(e.from);
      const email = match?.[1]?.toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      const name = e.from.replace(/<.*>/, "").trim() || email;
      people.push({ name, email, sourceId: e.id });
    }
    return people;
  }

  async scan(): Promise<ConnectorScanResult> {
    try {
      const unread = await this.getUnreadImportant();
      const items: ConnectorScanResult["items"] = unread.map((e) => ({
        sourceType: "gmail",
        externalId: `gmail:${e.id}`,
        title: e.subject,
        content: `${e.from}\n${e.snippet}`,
        metadata: JSON.stringify({ from: e.from, threadId: e.threadId, method: "gmail_api" }),
      }));
      return { connector: "gmail", items };
    } catch (err) {
      return {
        connector: "gmail",
        items: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async fetchMessages(querySuffix: string): Promise<EmailSummary[]> {
    const accessToken = await this.accessToken();
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${querySuffix}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!listRes.ok) {
      throw new Error(`Gmail list ${listRes.status}`);
    }
    const list = (await listRes.json()) as GmailListResponse;
    const summaries: EmailSummary[] = [];

    for (const msg of list.messages ?? []) {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
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

export function createGmailApiConnectorFromEnv(): GmailApiConnector | null {
  if (!hasGoogleOAuthConfigured()) return null;
  return new GmailApiConnector();
}

/** @deprecated use createGmailApiConnectorFromEnv */
export { createGmailApiConnectorFromEnv as createGmailConnectorFromEnv };
