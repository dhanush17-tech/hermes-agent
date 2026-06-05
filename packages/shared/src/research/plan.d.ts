import type { ResearchFreshness, ResearchOutputFormat, ResearchPlan, SourceType } from "./types.js";
export declare function inferResearchSources(question: string): SourceType[];
export declare function decomposeResearchQuestions(question: string): string[];
export declare function inferResearchOutputFormat(question: string): ResearchOutputFormat;
export declare function inferResearchFreshness(question: string): ResearchFreshness;
export declare function buildResearchPlan(userQuestion: string): ResearchPlan;
export declare function formatResearchPlanForPrompt(plan: ResearchPlan): string;
//# sourceMappingURL=plan.d.ts.map