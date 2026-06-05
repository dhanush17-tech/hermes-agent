export type RiskCategory =
  | "communication"
  | "calendar"
  | "reputation"
  | "work"
  | "routine"
  | "relationship"
  | "security"
  | "financial";

export type DetectedRisk = {
  category: RiskCategory;
  description: string;
  whyItMatters: string;
  evidence: string;
  impact: number;
  urgency: number;
  confidence: number;
  score: number;
  recommendedAction: string;
  preparedWork?: string;
  sourceType?: string;
  sourceId?: string;
};

export type RiskScanInput = {
  sourceItems: Array<{
    sourceType: string;
    title: string | null;
    content: string | null;
    metadata: string | null;
    externalId: string | null;
  }>;
  openLoops: Array<{
    description: string;
    dueDate: string | null;
    importanceScore: number | null;
    status: string | null;
  }>;
  tasks: Array<{
    title: string;
    dueDate: string | null;
    status: string | null;
  }>;
};
