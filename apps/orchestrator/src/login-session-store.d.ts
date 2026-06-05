import type { IntentEntities } from "@hermes-os/shared";
export type PendingLoginSession = {
    id: string;
    service: string;
    url: string;
    originalText: string;
    entities?: IntentEntities;
    preferCompose?: boolean;
    createdAt: string;
};
export declare class LoginSessionStore {
    private readonly path;
    constructor(workspaceRoot: string);
    get(): Promise<PendingLoginSession | null>;
    save(session: PendingLoginSession): Promise<void>;
    clear(): Promise<void>;
}
//# sourceMappingURL=login-session-store.d.ts.map