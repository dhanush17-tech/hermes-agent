import { loadGoogleAccountsFromEnv, type GoogleAccountConfig } from "./gmail-auth.js";
import { GmailSearch } from "./gmail-search.js";
import { GmailThreadReader } from "./gmail-thread.js";
import { GmailDrafts } from "./gmail-drafts.js";
import { extractOpenLoopsFromEmails } from "./gmail-open-loops-extract.js";
import type { EmailSummary, EmailThread, GmailOpenLoop } from "./types.js";

/** Multi-account Gmail connector (GOOGLE_ACCOUNTS env). */
export class MultiAccountGmailConnector {
  private readonly searchSvc: GmailSearch;
  private readonly threadSvc: GmailThreadReader;
  private readonly draftsSvc: GmailDrafts;

  constructor(private readonly accounts: GoogleAccountConfig[]) {
    this.searchSvc = new GmailSearch(accounts);
    this.threadSvc = new GmailThreadReader(accounts);
    this.draftsSvc = new GmailDrafts(accounts);
  }

  listAccounts(): GoogleAccountConfig[] {
    return [...this.accounts];
  }

  search(accountId: string, query: string, maxResults = 20): Promise<EmailSummary[]> {
    return this.searchSvc.search(accountId, query, maxResults);
  }

  getRecent(accountId: string, maxResults = 15): Promise<EmailSummary[]> {
    return this.searchSvc.getRecent(accountId, maxResults);
  }

  getUnread(accountId: string, maxResults = 15): Promise<EmailSummary[]> {
    return this.searchSvc.getUnread(accountId, maxResults);
  }

  readThread(accountId: string, threadId: string): Promise<EmailThread | null> {
    return this.threadSvc.readThread(accountId, threadId);
  }

  summarizeThreads(accountId: string, threadIds: string[]): Promise<string[]> {
    return this.threadSvc.summarizeThreads(accountId, threadIds);
  }

  async extractOpenLoops(accountId: string, query = "newer_than:3d"): Promise<GmailOpenLoop[]> {
    const emails = await this.search(accountId, query, 25);
    return extractOpenLoopsFromEmails(emails);
  }

  createDraft(accountId: string, threadId: string, body: string): Promise<{ draftId: string }> {
    return this.draftsSvc.createDraft(accountId, threadId, body);
  }

  sendDraft(
    accountId: string,
    draftId: string,
    capabilityLease?: string,
  ): Promise<{ messageId: string }> {
    return this.draftsSvc.sendDraft(accountId, draftId, capabilityLease);
  }
}

export function createMultiAccountGmailFromEnv(): MultiAccountGmailConnector | null {
  const accounts = loadGoogleAccountsFromEnv();
  if (!accounts.length) return null;
  return new MultiAccountGmailConnector(accounts);
}

/** Alias for multi-account connector. */
export { MultiAccountGmailConnector as GmailConnector };
