import { LaptopControlAgent } from "./laptop-control-agent.js";
/** Browser tasks use Mac screen + open URL; headless fetch is fallback only. */
export class BrowserAgent {
    laptop;
    constructor(executor, cf, workspaceRoot) {
        this.laptop = new LaptopControlAgent(executor, cf, workspaceRoot);
        this.executor = executor;
        this.cf = cf;
    }
    executor;
    cf;
    async run(text, entities, ctx) {
        const url = entities?.url ?? null;
        if (url && process.env.HERMES_HEADLESS_FETCH === "1") {
            return this.headlessFetch(text, url, ctx);
        }
        return this.laptop.run(text, { ...entities, url: url ?? entities?.url }, ctx);
    }
    async headlessFetch(text, url, ctx) {
        const result = await this.executor.invoke("web.fetch", { url }, ctx, { summary: `Fetch ${url}` });
        if (result.status === "pending_approval")
            return result.message;
        if (result.status === "denied")
            return `Denied: ${result.reason}`;
        const data = result.data;
        const snippet = (data.content ?? "").slice(0, 4000);
        if (!this.cf) {
            return `Fetched ${url} (HTTP ${data.status}).\n\n${snippet.slice(0, 1500)}`;
        }
        const summary = await this.cf.chat(`Summarize this page for the user request: ${text}\n\nContent:\n${snippet}`, { maxTokens: 1024, system: "Summarize key facts and answer the user's intent." });
        return `## ${url}\n\n${summary}`;
    }
}
//# sourceMappingURL=browser-agent.js.map