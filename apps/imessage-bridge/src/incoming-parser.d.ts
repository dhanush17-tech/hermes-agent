export type ParsedIncoming = {
    command?: string;
    raw: string;
    topic?: string;
    approvalId?: string;
    criticalExecute?: boolean;
    editInstruction?: string;
};
export declare function parseIncomingMessage(text: string): ParsedIncoming;
export declare function formatParsedForOrchestrator(parsed: ParsedIncoming): string;
//# sourceMappingURL=incoming-parser.d.ts.map