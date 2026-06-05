import type { CloudflareWorkersAIClient } from "@hermes-os/shared";
import type { ToolContext } from "@hermes-os/shared";
import type { SourceItemsRepository, OpenLoopsRepository } from "@hermes-os/context-graph";
import type { ActivityMonitor } from "@hermes-os/audit-log";
import type { ToolExecutor } from "@hermes-os/tool-executor";
export type PresenceService = {
    id: string;
    label: string;
    url: string;
};
export declare const DIGITAL_PRESENCE_SERVICES: PresenceService[];
export type PresenceScanResult = {
    service: string;
    summary: string;
    openLoops: string[];
    risks: string[];
    capturePath?: string;
    error?: string;
};
/**
 * DOM-first digital presence: Playwright observe → context graph (Gmail API when available).
 */
export declare class DigitalPresenceMonitor {
    private readonly executor;
    private readonly sourceItems;
    private readonly openLoops;
    private readonly cf;
    private readonly activity;
    private rotateIndex;
    constructor(executor: ToolExecutor, sourceItems: SourceItemsRepository, openLoops: OpenLoopsRepository, cf: CloudflareWorkersAIClient | null, activity: ActivityMonitor);
    scanNext(ctx: ToolContext): Promise<PresenceScanResult>;
    scanAll(ctx: ToolContext): Promise<PresenceScanResult[]>;
    scanService(service: PresenceService, ctx: ToolContext): Promise<PresenceScanResult>;
    private scanGmailViaApi;
    private inferOpenLoopsFromText;
    private persistScan;
}
//# sourceMappingURL=digital-presence-monitor.d.ts.map