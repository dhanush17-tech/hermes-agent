export type HermesRunEvent = {
    type: "run.started";
    runId: string;
} | {
    type: "tool.progress";
    name: string;
    detail?: string;
} | {
    type: "text.delta";
    text: string;
} | {
    type: "run.completed";
    output: string;
} | {
    type: "run.failed";
    error: string;
};
export interface HermesModelProvider {
    chat(input: string, opts?: {
        sessionKey?: string;
    }): Promise<string>;
    runWithEvents(input: string, opts?: {
        sessionKey?: string;
    }): AsyncIterable<HermesRunEvent>;
    healthCheck(): Promise<boolean>;
}
export declare class HermesGatewayClient implements HermesModelProvider {
    private readonly baseUrl;
    private readonly apiKey;
    constructor(baseUrl: string, apiKey: string);
    healthCheck(): Promise<boolean>;
    chat(input: string, opts?: {
        sessionKey?: string;
    }): Promise<string>;
    runWithEvents(input: string, opts?: {
        sessionKey?: string;
    }): AsyncIterable<HermesRunEvent>;
}
export declare class MockHermesModelProvider implements HermesModelProvider {
    healthCheck(): Promise<boolean>;
    chat(input: string): Promise<string>;
    runWithEvents(input: string): AsyncIterable<HermesRunEvent>;
}
//# sourceMappingURL=HermesModelProvider.d.ts.map