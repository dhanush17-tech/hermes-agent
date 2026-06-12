export type EvidenceItem = {
  claim: string;
  source: string;
  uri?: string;
  strength: "strong" | "weak";
};

export type ProductRecommendationInput = {
  query: string;
  category?: string;
  budget?: {
    min?: number;
    max?: number;
  };
  userConstraints?: string[];
  preferredRetailers?: string[];
};

export type ProductCandidateSeed = {
  title: string;
  url: string;
  retailer: string;
  snippet?: string;
};

export type ProductCandidate = {
  title: string;
  url: string;
  retailer: string;
  price?: number;
  rating?: number;
  reviewCount?: number;
  availability?: string;
  features: string[];
  evidence: EvidenceItem[];
};

export type ProductRecommendation = {
  winner: ProductCandidate;
  alternatives: ProductCandidate[];
  assumptions: string[];
  userPreferencesUsed: string[];
  unknowns: string[];
  reasoning: string;
  confidence: "low" | "medium" | "high";
  avoidIf?: string[];
};

export type ProductSearchOptions = {
  category?: string;
  budgetMax?: number;
  preferredRetailers?: string[];
  limit?: number;
};

export type ClarifyOrAssumeResult =
  | { action: "ask"; question: string }
  | { action: "assume"; assumptions: string[] }
  | { action: "proceed"; assumptions: string[] };

export type ProductRecommendationResult = {
  recommendation: ProductRecommendation;
  formatted: string;
  clarificationQuestion?: string;
};

export type ProductWorkflowStep = {
  step: string;
  detail?: string;
};
