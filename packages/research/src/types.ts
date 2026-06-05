import type { ResearchPlan, SourceType } from "@hermes-os/shared";

export type ResearchType =
  | "quick_answer"
  | "deep_memo"
  | "decision_analysis"
  | "implementation_plan"
  | "competitive_analysis"
  | "personal_context_question"
  | "meeting_prep";

export type RetrievalSourceKind =
  | "memory"
  | "context_graph"
  | "local_files"
  | "email"
  | "calendar"
  | "github"
  | "web";

export type RetrievedSnippet = {
  sourceKind: RetrievalSourceKind;
  sourceId: string;
  title: string;
  excerpt: string;
  uri?: string;
  observedAt: string;
};

export type ResearchEvidence = {
  id: string;
  claim: string;
  excerpt: string;
  sourceKind: RetrievalSourceKind;
  sourceId: string;
  uri?: string;
  confidence: number;
};

export type ResearchRunPlan = ResearchPlan & {
  researchType: ResearchType;
  selectedSources: RetrievalSourceKind[];
};

export type ResearchBundle = {
  plan: ResearchRunPlan;
  snippets: RetrievedSnippet[];
  evidence: ResearchEvidence[];
  citations: string;
  conflicts: string[];
};

export type ResearchRunOptions = {
  system?: string;
  memoryTopic?: string;
  isFollowUp?: boolean;
  skipWeb?: boolean;
  skipMemoryWrite?: boolean;
};

export type MemoryWriter = {
  formatContextForPrompt(topic: string, limit?: number): Promise<string>;
  search(query: string, limit?: number): Promise<Array<{ content: string; memoryType: string }>>;
  remember(input: {
    content: string;
    memoryType?: string;
    source?: string;
    evidence?: string;
  }): Promise<unknown>;
};

export { type ResearchPlan, type SourceType };
