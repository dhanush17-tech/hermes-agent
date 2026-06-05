export type SourceType = "web" | "memory" | "email" | "calendar" | "local_files" | "github" | "browser" | "social";
export type ResearchOutputFormat = "brief" | "memo" | "decision" | "implementation_plan";
export type ResearchFreshness = "current" | "stable" | "historical";
export type ResearchPlan = {
    userQuestion: string;
    subQuestions: string[];
    sourcesNeeded: SourceType[];
    freshnessRequirement: ResearchFreshness;
    outputFormat: ResearchOutputFormat;
};
export type StructuredResearchSections = {
    answer: string;
    confidence: string;
    reasoning: string;
    evidence: string;
    risks: string;
    nextAction: string;
    assumptions?: string;
};
export declare const RESEARCH_SECTION_HEADERS: readonly ["Answer", "Confidence", "Assumptions", "Reasoning", "Evidence", "Risks", "Recommended next action"];
//# sourceMappingURL=types.d.ts.map