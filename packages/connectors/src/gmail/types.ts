export type EmailSummary = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  receivedAt?: string;
};

export type EmailThread = {
  threadId: string;
  subject: string;
  messages: Array<{ from: string; body: string; date: string }>;
};

export type GmailOpenLoop = {
  description: string;
  sourceId: string;
  owner?: string;
  dueDate?: string;
};

export type PersonCandidate = {
  name: string;
  email: string;
  sourceId: string;
};

export type DraftResult = { draftId: string; threadId: string };
export type SendResult = { messageId: string; threadId: string };

export interface GmailConnectorPort {
  search(query: string): Promise<EmailSummary[]>;
  getUnreadImportant(): Promise<EmailSummary[]>;
  readThread(threadId: string): Promise<EmailThread | null>;
  extractOpenLoops(since: Date): Promise<GmailOpenLoop[]>;
  extractPeople(since: Date): Promise<PersonCandidate[]>;
}
