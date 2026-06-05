import type { RequestClassification } from "../types.js";
export type CloudflareModelRoutes = {
    default: string;
    routes: Partial<Record<RequestClassification | "default", string>>;
    hermes_providers?: Record<string, string>;
};
export declare function loadCloudflareModelRoutes(configPath?: string): CloudflareModelRoutes;
export declare class ModelRouter {
    private readonly routes;
    constructor(routes: CloudflareModelRoutes);
    resolve(classification: RequestClassification): string;
    hermesModelCommand(classification: RequestClassification): string | null;
}
//# sourceMappingURL=model-router.d.ts.map