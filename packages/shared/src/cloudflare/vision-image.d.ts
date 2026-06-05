export declare const DEFAULT_VISION_MODEL: string;
export type CloudflareRunResult = {
    success?: boolean;
    result?: {
        response?: string;
        description?: string;
        tool_calls?: unknown[];
    };
    errors?: Array<{
        message?: string;
    }>;
};
export declare function extractVisionText(data: CloudflareRunResult): string;
export declare function extractVisionError(data: CloudflareRunResult, status: number, body: string): string;
//# sourceMappingURL=vision-image.d.ts.map