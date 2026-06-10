import { isGmailCheckIntent, wantsBrowserGmail } from "@hermes-os/connectors";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { tryHandleGmailTask } from "./gmail-task-handler.js";

export type ConnectorTask = {
  kind: "gmail";
  text: string;
};

export class ConnectorRouter {
  match(text: string): ConnectorTask | null {
    if (wantsBrowserGmail(text)) return null;
    if (isGmailCheckIntent(text)) return { kind: "gmail", text };
    return null;
  }

  async run(task: ConnectorTask, executor: ToolExecutor, ctx: ToolContext): Promise<string | null> {
    if (task.kind === "gmail") {
      return tryHandleGmailTask(task.text, executor, ctx);
    }
    return null;
  }
}
