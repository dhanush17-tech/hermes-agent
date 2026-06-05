import Database from "better-sqlite3";
export type IncomingChatMessage = {
    rowid: number;
    handle: string;
    text: string;
    dateMs: number;
};
export declare const CHAT_DB_PATH: string;
export declare const CHAT_DB_FDA_INSTRUCTIONS: string;
export type ChatDbAccess = {
    status: "ok";
    db: Database.Database;
} | {
    status: "permission_denied";
    message: string;
} | {
    status: "missing";
    message: string;
} | {
    status: "error";
    message: string;
};
/** @deprecated use checkMessagesDbAccess */
export declare function openMessagesDb(): Database.Database | null;
export declare function checkMessagesDbAccess(): ChatDbAccess;
export declare function fetchMessagesSince(db: Database.Database, sinceRowId: number, limit?: number): IncomingChatMessage[];
//# sourceMappingURL=chat-db.d.ts.map