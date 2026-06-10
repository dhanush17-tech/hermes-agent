import type { IntentEntities, ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { LaptopControlAgent } from "./laptop-control-agent.js";

/** Browser tasks use Mac screen + open URL; headless fetch is fallback only. */
export class BrowserAgent {
  private readonly laptop: LaptopControlAgent;

  constructor(
    executor: ToolExecutor,
    workspaceRoot: string,
  ) {
    this.laptop = new LaptopControlAgent(executor, workspaceRoot);
    this.executor = executor;
  }

  private readonly executor: ToolExecutor;

  async run(text: string, entities: IntentEntities | undefined, ctx: ToolContext): Promise<string> {
    const url = entities?.url ?? null;
    if (url && process.env.HERMES_HEADLESS_FETCH === "1") {
      return this.headlessFetch(text, url, ctx);
    }
    return this.laptop.run(text, { ...entities, url: url ?? entities?.url }, ctx);
  }

  private async headlessFetch(text: string, url: string, ctx: ToolContext): Promise<string> {
    const result = await this.executor.invoke("web.fetch", { url }, ctx, { summary: `Fetch ${url}` });
    if (result.status === "pending_approval") return result.message;
    if (result.status === "denied") return `Denied: ${result.reason}`;

    const data = result.data as { content?: string; status?: number };
    const snippet = (data.content ?? "").slice(0, 4000);
    return `Fetched ${url} (HTTP ${data.status}).\n\n${snippet.slice(0, 1500)}`;
  }
}
