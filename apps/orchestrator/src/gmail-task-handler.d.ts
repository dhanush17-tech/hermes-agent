import { isGmailCheckIntent, wantsBrowserGmail } from "@hermes-os/connectors";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
export { isGmailCheckIntent, wantsBrowserGmail };
/** Connector-first Gmail — uses workflow engine when executor available. */
export declare function tryHandleGmailTask(text: string, executor?: ToolExecutor, ctx?: ToolContext): Promise<string | null>;
//# sourceMappingURL=gmail-task-handler.d.ts.map