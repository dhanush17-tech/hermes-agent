import type { GmailConnectorPort, PersonCandidate } from "./types.js";

export async function extractGmailPeople(
  connector: GmailConnectorPort,
  since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
): Promise<PersonCandidate[]> {
  return connector.extractPeople(since);
}

export function rankPersonImportance(person: PersonCandidate, interactionCount = 1): number {
  let score = 3;
  if (interactionCount >= 5) score = 5;
  else if (interactionCount >= 2) score = 4;
  if (/investor|founder|ceo|partner/i.test(person.name)) score = Math.min(5, score + 1);
  return score;
}
