import type { SourceItemsRepository } from "../repos/source-items.js";
import type { PeopleRepository } from "../repos/people.js";
import type { OpenLoopsRepository } from "../repos/open-loops.js";
import type { EvidenceRepository } from "../repos/evidence.js";
import type { RelationshipEventsRepository } from "../repos/relationship-events.js";
import type { CommitmentsRepository } from "../repos/commitments.js";
import type { ExtractedFacts } from "./types.js";

const WAITING_PATTERN =
  /\b(reply|follow.?up|confirm|waiting|rsvp|logistics|deadline|action required|let me know|please respond)\b/i;

function parseEmailFromContent(content: string): { name: string; email: string } | null {
  const line = content.split("\n")[0] ?? content;
  const match = /^(.*?)\s*<([^>]+)>$/.exec(line.trim()) || /^([^\s]+@[^\s]+)$/.exec(line.trim());
  if (!match) return null;
  if (match[2]) {
    return { name: match[1]!.trim() || match[2], email: match[2].toLowerCase() };
  }
  return { name: match[1]!, email: match[1]!.toLowerCase() };
}

function parseGmailMetadata(metadata: string | null): { from?: string; threadId?: string } {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as { from?: string; threadId?: string };
  } catch {
    return {};
  }
}

export function extractFactsFromSourceItems(
  items: Awaited<ReturnType<SourceItemsRepository["listRecent"]>>,
): ExtractedFacts {
  const facts: ExtractedFacts = {
    people: [],
    openLoops: [],
    evidence: [],
    relationshipEvents: [],
    commitments: [],
  };

  for (const item of items) {
    if (item.sourceType !== "gmail") continue;
    const blob = `${item.title ?? ""}\n${item.content ?? ""}`;
    if (!WAITING_PATTERN.test(blob)) continue;

    const meta = parseGmailMetadata(item.metadata);
    const fromLine = meta.from ?? item.content?.split("\n")[0] ?? "";
    const parsed = parseEmailFromContent(fromLine);
    const personName = parsed?.name ?? (fromLine.slice(0, 60) || "Unknown sender");
    const personEmail = parsed?.email;

    if (personEmail) {
      facts.people.push({
        name: personName,
        emails: [personEmail],
        importanceScore: /investor|founder|partner|ceo/i.test(personName) ? 5 : 3,
      });
    }

    facts.openLoops.push({
      description: `Email: ${item.title ?? "follow-up"} — ${(item.content ?? "").slice(0, 120)}`,
      source: "gmail",
      sourceId: item.id,
      owner: "user",
    });

    facts.evidence.push({
      sourceItemId: item.id,
      excerpt: blob.slice(0, 400),
      claim: `Possible follow-up: ${item.title ?? "email"}`,
      confidence: 0.75,
    });
  }

  return facts;
}

export class ExtractionPipeline {
  constructor(
    private readonly sourceItems: SourceItemsRepository,
    private readonly people: PeopleRepository,
    private readonly openLoops: OpenLoopsRepository,
    private readonly evidence: EvidenceRepository,
    private readonly relationshipEvents: RelationshipEventsRepository,
    private readonly commitments: CommitmentsRepository,
  ) {}

  async extractFromRecentSources(limit = 40): Promise<ExtractedFacts> {
    const items = await this.sourceItems.listRecent(limit);
    return extractFactsFromSourceItems(items);
  }

  async applyExtractedFacts(facts: ExtractedFacts): Promise<{
    people: number;
    openLoops: number;
    evidence: number;
    events: number;
    commitments: number;
  }> {
    const emailToPersonId = new Map<string, string>();
    let peopleCount = 0;

    for (const p of facts.people) {
      const person = await this.people.upsertPerson(p);
      peopleCount += 1;
      for (const email of person.emails) {
        emailToPersonId.set(email.toLowerCase(), person.id);
      }
    }

    let openLoopsCount = 0;
    for (const loop of facts.openLoops) {
      let relatedPersonId = loop.relatedPersonId;
      if (!relatedPersonId && loop.sourceId) {
        const item = await this.sourceItems.listRecent(100);
        const src = item.find((i) => i.id === loop.sourceId);
        if (src) {
          const meta = parseGmailMetadata(src.metadata);
          const parsed = parseEmailFromContent(meta.from ?? "");
          if (parsed?.email) {
            relatedPersonId = emailToPersonId.get(parsed.email);
          }
        }
      }
      await this.openLoops.createLoop({
        ...loop,
        relatedPersonId,
        importanceScore: 0.7,
      });
      openLoopsCount += 1;
    }

    let evidenceCount = 0;
    for (const ev of facts.evidence) {
      await this.evidence.insert(ev);
      evidenceCount += 1;
    }

    let eventsCount = 0;
    for (const ev of facts.relationshipEvents) {
      await this.relationshipEvents.insert(ev);
      eventsCount += 1;
    }

    let commitmentsCount = 0;
    for (const c of facts.commitments) {
      await this.commitments.insert(c);
      commitmentsCount += 1;
    }

    return {
      people: peopleCount,
      openLoops: openLoopsCount,
      evidence: evidenceCount,
      events: eventsCount,
      commitments: commitmentsCount,
    };
  }

  async runIncrementalSync(): Promise<ExtractedFacts> {
    const facts = await this.extractFromRecentSources();
    await this.applyExtractedFacts(facts);
    return facts;
  }
}
