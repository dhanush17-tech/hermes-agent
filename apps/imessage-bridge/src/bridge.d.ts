import type { Orchestrator } from "@hermes-os/orchestrator";
export type IMessageBridgeOptions = {
    pollIntervalMs?: number;
    onReply?: (handle: string, text: string) => void;
};
export declare class IMessageBridge {
    private readonly orchestrator;
    private lastRowId;
    private readonly approved;
    private db;
    private chatState;
    private userNotified;
    private lastAccessRetryAt;
    constructor(orchestrator: Orchestrator);
    pollOnce(): Promise<number>;
    runLoop(options?: IMessageBridgeOptions): Promise<void>;
    private tryOpenDb;
    private onChatDbBlocked;
    private closeDb;
    private handleIncoming;
}
//# sourceMappingURL=bridge.d.ts.map