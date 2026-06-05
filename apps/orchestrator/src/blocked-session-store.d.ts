export type PendingBlockedSession = {
    id: string;
    goal: string;
    question: string;
    trace: string[];
    createdAt: string;
};
export declare class BlockedSessionStore {
    private readonly path;
    constructor(workspaceRoot: string);
    get(): Promise<PendingBlockedSession | null>;
    save(session: PendingBlockedSession): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=blocked-session-store.d.ts.map