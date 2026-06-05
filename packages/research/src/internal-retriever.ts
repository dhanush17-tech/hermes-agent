import { FileIndexer, searchIndexedFiles } from "@hermes-os/connectors";
import type { ContextGraphService } from "@hermes-os/context-graph";
import type { GmailConnectorPort } from "@hermes-os/connectors";
import type { CalendarConnectorPort } from "@hermes-os/connectors";
import type { MemoryWriter, RetrievedSnippet, RetrievalSourceKind } from "./types.js";
import type { ResearchRunPlan } from "./types.js";

export type InternalRetrieverDeps = {
  memory: MemoryWriter;
  workspaceRoot: string;
  contextGraph?: ContextGraphService | null;
  gmail?: GmailConnectorPort | null;
  calendar?: Pick<CalendarConnectorPort, "getToday" | "getUpcoming"> | null;
};

function extractSearchTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const m of query.matchAll(/\b([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)\b/g)) {
    terms.add(m[1]!);
  }
  for (const w of query.split(/\s+/)) {
    if (w.length > 4) terms.add(w);
  }
  return [...terms].slice(0, 8);
}

function matchesQuery(blob: string, query: string): boolean {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return true;
  const lower = blob.toLowerCase();
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

function nowIso(): string {
  return new Date().toISOString();
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export class InternalRetriever {
  constructor(private readonly deps: InternalRetrieverDeps) {}

  async retrieve(
    plan: ResearchRunPlan,
    selected: RetrievalSourceKind[],
  ): Promise<RetrievedSnippet[]> {
    const snippets: RetrievedSnippet[] = [];
    const q = plan.userQuestion;

    if (selected.includes("memory")) {
      snippets.push(...(await this.retrieveMemory(q)));
    }
    if (selected.includes("context_graph") && this.deps.contextGraph) {
      snippets.push(...(await this.retrieveContextGraph(q)));
    }
    if (selected.includes("local_files")) {
      snippets.push(...this.retrieveLocalFiles(q));
    }
    if (selected.includes("email") && this.deps.gmail) {
      snippets.push(...(await this.retrieveEmail(q)));
    }
    if (selected.includes("calendar") && this.deps.calendar) {
      snippets.push(...(await this.retrieveCalendar()));
    }

    return snippets.slice(0, 24);
  }

  private async retrieveMemory(query: string): Promise<RetrievedSnippet[]> {
    const rows = await this.deps.memory.search(query, 10);
    return rows.map((r, i) => ({
      sourceKind: "memory" as const,
      sourceId: `memory:${i}`,
      title: `Memory (${r.memoryType})`,
      excerpt: r.content.slice(0, 600),
      observedAt: nowIso(),
    }));
  }

  private async retrieveContextGraph(query: string): Promise<RetrievedSnippet[]> {
    const graph = this.deps.contextGraph!;
    const snippets: RetrievedSnippet[] = [];

    const terms = extractSearchTerms(query);
    const projectLists = await Promise.all([
      graph.findProjects(query),
      ...terms.map((t) => graph.findProjects(t)),
    ]);
    const peopleLists = await Promise.all([
      graph.findPeople(query),
      ...terms.map((t) => graph.findPeople(t)),
    ]);
    const projects = dedupeById(projectLists.flat());
    const people = dedupeById(peopleLists.flat());
    const [loops, sources] = await Promise.all([
      graph.findOpenLoops({ status: "open" }),
      graph.sourceItems.listRecent(30),
    ]);

    for (const p of projects.slice(0, 5)) {
      snippets.push({
        sourceKind: "context_graph",
        sourceId: `project:${p.id}`,
        title: `Project: ${p.name}`,
        excerpt: (p.description ?? p.name).slice(0, 500),
        observedAt: p.updatedAt,
      });
    }

    for (const person of people.slice(0, 5)) {
      snippets.push({
        sourceKind: "context_graph",
        sourceId: `person:${person.id}`,
        title: `Person: ${person.name}`,
        excerpt: `${person.name} — ${person.emails.join(", ")}`.slice(0, 400),
        observedAt: person.updatedAt,
      });
    }

    for (const loop of loops.filter((l) => matchesQuery(l.description, query)).slice(0, 5)) {
      snippets.push({
        sourceKind: "context_graph",
        sourceId: `open_loop:${loop.id}`,
        title: "Open loop",
        excerpt: loop.description.slice(0, 400),
        observedAt: loop.updatedAt ?? nowIso(),
      });
    }

    for (const item of sources.filter((s) => matchesQuery(`${s.title} ${s.content}`, query)).slice(0, 8)) {
      snippets.push({
        sourceKind: "context_graph",
        sourceId: `source:${item.id}`,
        title: item.title ?? item.sourceType,
        excerpt: `${item.title ?? ""}\n${item.content ?? ""}`.slice(0, 500),
        observedAt: item.updatedAt,
      });
    }

    return snippets;
  }

  private retrieveLocalFiles(query: string): RetrievedSnippet[] {
    const indexer = new FileIndexer(this.deps.workspaceRoot);
    const files = indexer.scan(40, 60);
    return searchIndexedFiles(files, query, 8).map((f) => ({
      sourceKind: "local_files" as const,
      sourceId: `file:${f.path}`,
      title: f.path,
      excerpt: `${f.summary}\n${f.extractedText}`.slice(0, 600),
      uri: f.path,
      observedAt: f.modifiedAt,
    }));
  }

  private async retrieveEmail(query: string): Promise<RetrievedSnippet[]> {
    try {
      const emails = await this.deps.gmail!.search(query.slice(0, 80));
      return emails.slice(0, 6).map((e) => ({
        sourceKind: "email" as const,
        sourceId: `gmail:${e.threadId ?? e.id}`,
        title: e.subject,
        excerpt: `${e.from}\n${e.snippet}`.slice(0, 500),
        uri: e.threadId ? `gmail:thread:${e.threadId}` : undefined,
        observedAt: e.receivedAt ?? nowIso(),
      }));
    } catch {
      return [];
    }
  }

  private async retrieveCalendar(): Promise<RetrievedSnippet[]> {
    try {
      const events = await this.deps.calendar!.getUpcoming(2);
      return events.slice(0, 8).map((e) => ({
        sourceKind: "calendar" as const,
        sourceId: `calendar:${e.id}`,
        title: e.title,
        excerpt: `${e.startsAt}${e.location ? ` @ ${e.location}` : ""}`.slice(0, 300),
        observedAt: e.startsAt,
      }));
    } catch {
      return [];
    }
  }
}
