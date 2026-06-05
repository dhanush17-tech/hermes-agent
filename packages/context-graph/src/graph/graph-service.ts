import { generateId } from "@hermes-os/shared";
import type { ContextGraphDb } from "../db.js";
import { PeopleRepository } from "../repos/people.js";
import { ProjectsRepository } from "../repos/projects.js";
import { SourceItemsRepository, type SourceItemRow } from "../repos/source-items.js";
import { EvidenceRepository } from "../repos/evidence.js";
import { CommitmentsRepository } from "../repos/commitments.js";
import { RelationshipEventsRepository } from "../repos/relationship-events.js";
import { OpenLoopsRepository } from "../repos/open-loops.js";
import { RisksRepository } from "../repos/risks.js";
import { ExtractionPipeline } from "./extraction-pipeline.js";
import type {
  Person,
  PersonInput,
  Project,
  ProjectInput,
  OpenLoop,
  OpenLoopFilters,
  CommitmentFilters,
  RiskFilters,
  Risk,
  DailyContext,
  PersonContext,
  ProjectContext,
  WaitingOnYouEntry,
  EvidenceInput,
  CommitmentInput,
  RelationshipEventInput,
  SourceItemInput,
  ExtractedFacts,
} from "./types.js";
import type { CommitmentRecord } from "./types.js";
import type { EvidenceRecord } from "../repos/evidence.js";

export class ContextGraphService {
  readonly people: PeopleRepository;
  readonly projects: ProjectsRepository;
  readonly sourceItems: SourceItemsRepository;
  readonly evidence: EvidenceRepository;
  readonly commitments: CommitmentsRepository;
  readonly relationshipEvents: RelationshipEventsRepository;
  readonly openLoops: OpenLoopsRepository;
  readonly risks: RisksRepository;
  readonly extraction: ExtractionPipeline;

  constructor(db: ContextGraphDb) {
    this.people = new PeopleRepository(db);
    this.projects = new ProjectsRepository(db);
    this.sourceItems = new SourceItemsRepository(db);
    this.evidence = new EvidenceRepository(db);
    this.commitments = new CommitmentsRepository(db);
    this.relationshipEvents = new RelationshipEventsRepository(db);
    this.openLoops = new OpenLoopsRepository(db);
    this.risks = new RisksRepository(db);
    this.extraction = new ExtractionPipeline(
      this.sourceItems,
      this.people,
      this.openLoops,
      this.evidence,
      this.relationshipEvents,
      this.commitments,
    );
  }

  async upsertPerson(input: PersonInput): Promise<Person> {
    return this.people.upsertPerson(input);
  }

  async upsertProject(input: ProjectInput): Promise<Project> {
    return this.projects.upsertProject(input);
  }

  async upsertSourceItem(input: SourceItemInput): Promise<SourceItemRow> {
    const now = new Date().toISOString();
    const row: SourceItemRow = {
      id: input.id ?? generateId("src"),
      sourceType: input.sourceType,
      externalId: input.externalId ?? null,
      title: input.title ?? null,
      content: input.content ?? null,
      metadata: input.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.sourceItems.upsert(row);
    return row;
  }

  async addEvidence(input: EvidenceInput): Promise<EvidenceRecord> {
    return this.evidence.insert(input);
  }

  async addCommitment(input: CommitmentInput): Promise<CommitmentRecord> {
    return this.commitments.insert(input);
  }

  async addRelationshipEvent(input: RelationshipEventInput): Promise<void> {
    await this.relationshipEvents.insert(input);
  }

  async findPeople(query: string): Promise<Person[]> {
    return this.people.findByQuery(query);
  }

  async findProjects(query: string): Promise<Project[]> {
    return this.projects.findByQuery(query);
  }

  async findOpenLoops(filters: OpenLoopFilters = {}): Promise<OpenLoop[]> {
    return this.openLoops.findOpenLoops(filters);
  }

  async findCommitments(filters: CommitmentFilters = {}): Promise<CommitmentRecord[]> {
    return this.commitments.findCommitments(filters);
  }

  async findRisks(filters: RiskFilters = {}): Promise<Risk[]> {
    const rows = await this.risks.listActive(50);
    return rows
      .map((r) => ({
        id: r.id,
        category: r.category ?? undefined,
        description: r.description,
        impact: r.impact ?? undefined,
        urgency: r.urgency ?? undefined,
        confidence: r.confidence ?? undefined,
        score: r.score ?? undefined,
        relatedProjectId: r.relatedProjectId ?? undefined,
        relatedPersonId: r.relatedPersonId ?? undefined,
        status: r.status ?? undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .filter((r) => {
        if (filters.status && r.status !== filters.status) return false;
        if (filters.minScore !== undefined && (r.score ?? 0) < filters.minScore) return false;
        if (filters.category && r.category !== filters.category) return false;
        return true;
      });
  }

  async applyExtractedFacts(facts: ExtractedFacts) {
    return this.extraction.applyExtractedFacts(facts);
  }

  async syncFromSources(): Promise<ExtractedFacts> {
    return this.extraction.runIncrementalSync();
  }

  async getWhoIsWaitingOnYou(): Promise<WaitingOnYouEntry[]> {
    await this.syncFromSources().catch(() => undefined);

    const loops = await this.openLoops.findOpenLoops({ status: "open" }, 40);
    const waitingLoops = loops.filter((l) =>
      /\b(email|reply|follow|waiting|from:)\b/i.test(l.description),
    );

    const byPerson = new Map<string, WaitingOnYouEntry>();

    for (const loop of waitingLoops) {
      let person: Person | null = null;
      if (loop.relatedPersonId) {
        person = await this.people.getById(loop.relatedPersonId);
      }
      if (!person && loop.sourceId) {
        const items = await this.sourceItems.listRecent(50);
        const src = items.find((i) => i.id === loop.sourceId);
        const from = src?.content?.split("\n")[0] ?? "";
        const emailMatch = /<?([^<\s]+@[^>\s]+)>?/.exec(from);
        if (emailMatch?.[1]) {
          const id = await this.people.upsertByEmail({
            name: from.replace(/<.*>/, "").trim() || emailMatch[1],
            email: emailMatch[1].toLowerCase(),
          });
          person = await this.people.getById(id);
        }
      }
      if (!person) {
        person = {
          id: "unknown",
          name: loop.description.slice(0, 40),
          emails: [],
          phones: [],
          handles: {},
          importanceScore: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      const key = person.id;
      let entry = byPerson.get(key);
      if (!entry) {
        entry = {
          person,
          reason: loop.description,
          evidence: [],
          openLoopIds: [],
          commitmentIds: [],
          suggestedReply: this.suggestReply(person.name, loop.description),
          score: (loop.importanceScore ?? 0.5) * 100,
        };
        byPerson.set(key, entry);
      }
      entry.openLoopIds.push(loop.id);
      if (loop.sourceId) {
        const ev = await this.evidence.listBySourceItem(loop.sourceId);
        entry.evidence.push(...ev);
      }
      entry.score = Math.max(entry.score, (loop.importanceScore ?? 0.5) * 100);
    }

    const openCommitments = await this.commitments.findCommitments({
      status: "open",
      owner: "user",
    });
    for (const c of openCommitments) {
      if (!c.counterpartyPersonId) continue;
      const person = await this.people.getById(c.counterpartyPersonId);
      if (!person) continue;
      let entry = byPerson.get(person.id);
      if (!entry) {
        entry = {
          person,
          reason: c.description,
          evidence: [],
          openLoopIds: [],
          commitmentIds: [],
          suggestedReply: this.suggestReply(person.name, c.description),
          score: 60,
        };
        byPerson.set(person.id, entry);
      }
      entry.commitmentIds.push(c.id);
      entry.score += 10;
    }

    return [...byPerson.values()].sort((a, b) => b.score - a.score);
  }

  formatWaitingOnYouReport(entries: WaitingOnYouEntry[]): string {
    if (entries.length === 0) {
      return "No one clearly waiting on you in the context graph right now.\n\nTry: run connector sync (daemon) or check Gmail for unread threads needing reply.";
    }

    const lines = ["People waiting on you", ""];
    for (const e of entries.slice(0, 8)) {
      lines.push(`**${e.person.name}** (score ${Math.round(e.score)})`);
      lines.push(`Why: ${e.reason.slice(0, 200)}`);
      if (e.evidence.length > 0) {
        lines.push("Evidence:");
        for (const ev of e.evidence.slice(0, 2)) {
          lines.push(`- ${ev.excerpt.slice(0, 120)}`);
        }
      }
      lines.push(`Suggested reply: ${e.suggestedReply}`);
      lines.push("");
    }
    lines.push("Reply options: show draft | approve send | ignore");
    return lines.join("\n");
  }

  private suggestReply(name: string, context: string): string {
    const first = name.split(/\s+/)[0] ?? name;
    if (/logistics|venue|event|rsvp/i.test(context)) {
      return `Hi ${first} — thanks for following up. I'll confirm final logistics and send details today.`;
    }
    if (/\?/.test(context)) {
      return `Hi ${first} — good question. I'll get back to you with a clear answer shortly.`;
    }
    return `Hi ${first} — thanks for your note. I'll follow up properly today.`;
  }

  async getDailyContext(date = new Date()): Promise<DailyContext> {
    await this.syncFromSources().catch(() => undefined);
    const waitingOnYou = await this.getWhoIsWaitingOnYou();
    return {
      date: date.toISOString().slice(0, 10),
      people: await this.people.listImportant(15),
      projects: await this.projects.listActive(10),
      openLoops: await this.openLoops.findOpenLoops({ status: "open" }, 20),
      commitments: await this.commitments.listOpen(15),
      risks: await this.findRisks({ status: "active", minScore: 40 }),
      waitingOnYou,
    };
  }

  async getPersonContext(personId: string): Promise<PersonContext | null> {
    const person = await this.people.getById(personId);
    if (!person) return null;
    const evidence: EvidenceRecord[] = [];
    const loops = await this.openLoops.findOpenLoops({ relatedPersonId: personId }, 20);
    for (const loop of loops) {
      if (loop.sourceId) {
        evidence.push(...(await this.evidence.listBySourceItem(loop.sourceId)));
      }
    }
    return {
      person,
      events: await this.relationshipEvents.listByPerson(personId),
      openLoops: loops,
      commitments: await this.commitments.findCommitments({
        counterpartyPersonId: personId,
      }),
      evidence,
    };
  }

  async getProjectContext(projectId: string): Promise<ProjectContext | null> {
    const project = await this.projects.getById(projectId);
    if (!project) return null;
    const allLoops = await this.openLoops.findOpenLoops({}, 50);
    return {
      project,
      openLoops: allLoops.filter((l) => l.relatedProjectId === projectId),
      commitments: await this.commitments.findCommitments({}),
      risks: await this.findRisks({}),
    };
  }
}

export function createContextGraphService(db: ContextGraphDb): ContextGraphService {
  return new ContextGraphService(db);
}
