/**
 * Optional Stagehand adapter — use when DOM selectors are unstable.
 * Enable with HERMES_STAGEHAND_ENABLED=1 and install @browserbasehq/stagehand.
 */
export type StagehandObserveResult = {
  actions: Array<{ description: string; selector?: string }>;
};

type StagehandLike = {
  init: () => Promise<void>;
  observe: (instruction: string, opts?: { page?: unknown }) => Promise<unknown>;
  act: (instruction: string, opts?: { page?: unknown }) => Promise<unknown>;
  extract: (instruction: string, opts?: { page?: unknown }) => Promise<unknown>;
  close: () => Promise<void>;
};

export class StagehandDriver {
  private instance: StagehandLike | null = null;

  get enabled(): boolean {
    return process.env.HERMES_STAGEHAND_ENABLED === "1";
  }

  private async load(): Promise<StagehandLike> {
    if (!this.enabled) {
      throw new Error("Stagehand disabled — set HERMES_STAGEHAND_ENABLED=1");
    }
    if (this.instance) return this.instance;
    try {
      const mod = (await import("@browserbasehq/stagehand")) as unknown as {
        Stagehand: new (opts: {
          env: "LOCAL" | "BROWSERBASE";
          modelName?: string;
          modelClientOptions?: Record<string, unknown>;
        }) => StagehandLike;
      };
      const sh = new mod.Stagehand({
        env: "LOCAL",
        modelName:
          process.env.HERMES_STAGEHAND_MODEL ??
          process.env.HERMES_MESSAGING_MODEL ??
          "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        modelClientOptions: {
          apiKey: process.env.CLOUDFLARE_API_TOKEN,
          baseURL: process.env.CLOUDFLARE_AI_BASE_URL,
        },
      });
      await sh.init();
      this.instance = sh;
      return sh;
    } catch (err) {
      throw new Error(
        `Stagehand unavailable — install @browserbasehq/stagehand. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async observe(page: unknown, instruction: string): Promise<StagehandObserveResult> {
    const sh = await this.load();
    const raw = await sh.observe(instruction, { page });
    const list = Array.isArray(raw) ? raw : [];
    const actions = list.map((a) => {
      const item = a as { description?: string; selector?: string };
      return { description: item.description ?? "action", selector: item.selector };
    });
    return { actions };
  }

  async act(page: unknown, instruction: string): Promise<{ success: boolean }> {
    const sh = await this.load();
    const result = await sh.act(instruction, { page });
    const ok = (result as { success?: boolean })?.success;
    return { success: ok !== false };
  }

  async extract(page: unknown, instruction: string): Promise<string> {
    const sh = await this.load();
    const raw = await sh.extract(instruction, { page });
    if (typeof raw === "string") return raw;
    if (raw && typeof raw === "object" && "extraction" in raw) {
      return String((raw as { extraction?: string }).extraction ?? "");
    }
    return JSON.stringify(raw);
  }
}

export const stagehandDriver = new StagehandDriver();
