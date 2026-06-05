import type { SourceItemRow } from "../repos/source-items.js";
import type { EvidenceRecord } from "../repos/evidence.js";
export type CommitmentRecord = {
  id: string;
  description: string;
  owner: string;
  counterpartyPersonId?: string;
  relatedProjectId?: string;
  dueAt?: string;
  status: string;
  sourceItemId?: string;
  evidenceItemId?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
};

export type Person = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  handles: Record<string, string>;
  organization?: string;
  role?: string;
  relationshipType?: string;
  importanceScore: number;
  lastInteractionAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  status: string;
  priority: number;
  goals: string[];
  relatedPeople: string[];
  relatedDocuments: string[];
  deadlines: string[];
  createdAt: string;
  updatedAt: string;
};

export type OpenLoop = {
  id: string;
  source: string;
  sourceId?: string;
  description: string;
  owner?: string;
  relatedPersonId?: string;
  relatedProjectId?: string;
  dueDate?: string;
  importanceScore?: number;
  confidence?: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type Risk = {
  id: string;
  category?: string;
  description: string;
  impact?: number;
  urgency?: number;
  confidence?: number;
  score?: number;
  relatedProjectId?: string;
  relatedPersonId?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
};

export type RelationshipEvent = {
  id: string;
  personId: string;
  sourceItemId?: string;
  eventType: string;
  summary: string;
  sentiment?: string;
  importance: number;
  occurredAt: string;
  createdAt: string;
};

export type PersonInput = {
  name: string;
  emails?: string[];
  phones?: string[];
  handles?: Record<string, string>;
  organization?: string;
  role?: string;
  relationshipType?: string;
  importanceScore?: number;
  notes?: string;
};

export type ProjectInput = {
  name: string;
  description?: string;
  status?: string;
  priority?: number;
  goals?: string[];
  relatedPeople?: string[];
  deadlines?: string[];
};

export type SourceItemInput = Omit<SourceItemRow, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export type EvidenceInput = {
  sourceItemId: string;
  excerpt: string;
  claim?: string;
  confidence?: number;
};

export type CommitmentInput = {
  description: string;
  owner: string;
  counterpartyPersonId?: string;
  relatedProjectId?: string;
  dueAt?: string;
  sourceItemId?: string;
  evidenceItemId?: string;
  confidence?: number;
};

export type RelationshipEventInput = {
  personId: string;
  sourceItemId?: string;
  eventType: string;
  summary: string;
  sentiment?: string;
  importance?: number;
  occurredAt?: string;
};

export type OpenLoopFilters = {
  status?: string;
  owner?: string;
  relatedPersonId?: string;
  minImportance?: number;
};

export type CommitmentFilters = {
  status?: string;
  owner?: string;
  counterpartyPersonId?: string;
};

export type RiskFilters = {
  status?: string;
  minScore?: number;
  category?: string;
};

export type WaitingOnYouEntry = {
  person: Person;
  reason: string;
  evidence: EvidenceRecord[];
  openLoopIds: string[];
  commitmentIds: string[];
  suggestedReply: string;
  score: number;
};

export type DailyContext = {
  date: string;
  people: Person[];
  projects: Project[];
  openLoops: OpenLoop[];
  commitments: CommitmentRecord[];
  risks: Risk[];
  waitingOnYou: WaitingOnYouEntry[];
};

export type PersonContext = {
  person: Person;
  events: RelationshipEvent[];
  openLoops: OpenLoop[];
  commitments: CommitmentRecord[];
  evidence: EvidenceRecord[];
};

export type ProjectContext = {
  project: Project;
  openLoops: OpenLoop[];
  commitments: CommitmentRecord[];
  risks: Risk[];
};

export type ExtractedFacts = {
  people: PersonInput[];
  openLoops: Array<{
    description: string;
    source: string;
    sourceId?: string;
    relatedPersonId?: string;
    owner?: string;
  }>;
  evidence: EvidenceInput[];
  relationshipEvents: RelationshipEventInput[];
  commitments: CommitmentInput[];
};
