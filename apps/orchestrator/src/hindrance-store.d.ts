export type HindranceCategory = "chat_db" | "vision" | "browser" | "permission" | "cloudflare" | "unknown";
export type ActiveHindrance = {
    id: string;
    category: HindranceCategory;
    issue: string;
    question: string;
    resolutionHint?: string;
    userNotified: boolean;
    createdAt: string;
};
export declare class HindranceStore {
    private readonly path;
    constructor(workspaceRoot: string);
    getActive(): Promise<ActiveHindrance | null>;
    /** Returns null if same category already waiting (no duplicate alerts). */
    report(input: {
        category: HindranceCategory;
        issue: string;
        question: string;
        resolutionHint?: string;
    }): Promise<ActiveHindrance | null>;
    markNotified(): Promise<void>;
    clear(): Promise<void>;
    isResumeMessage(text: string): boolean;
}
//# sourceMappingURL=hindrance-store.d.ts.map