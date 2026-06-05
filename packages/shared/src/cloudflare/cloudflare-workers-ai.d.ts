import type { RequestClassification } from "../types.js";
export type CloudflareChatOptions = {
    model?: string;
    classification?: RequestClassification;
    maxTokens?: number;
    system?: string;
    /** Prior user/assistant turns (current user message is passed separately). */
    history?: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
};
export declare class CloudflareWorkersAIClient {
    private readonly accountId;
    private readonly apiToken;
    private readonly router;
    private visionLicenseAgreed;
    constructor(accountId: string, apiToken: string, routesConfigPath?: string);
    get baseUrl(): string;
    resolveModel(classification: RequestClassification): string;
    /** Vision via Workers AI /ai/run (Llama 3.2 Vision). Resizes should be done before call. */
    chatWithImage(imageBase64: string, mimeType: string, opts?: CloudflareChatOptions & {
        prompt?: string;
    }): Promise<string>;
    analyzeImageBuffer(imageBuffer: Buffer, mimeType: string, opts?: CloudflareChatOptions & {
        prompt?: string;
    }): Promise<string>;
    private ensureVisionLicense;
    private visionRunUrl;
    private postVisionRun;
    private postVisionChatCompletions;
    chat(userMessage: string, opts?: CloudflareChatOptions): Promise<string>;
    healthCheck(): Promise<boolean>;
}
export declare function createCloudflareClientFromEnv(): CloudflareWorkersAIClient | null;
//# sourceMappingURL=cloudflare-workers-ai.d.ts.map