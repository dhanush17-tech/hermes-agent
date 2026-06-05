import { withAssistantPolicy, } from "@hermes-os/shared";
import { AutonomousAgent } from "./autonomous-agent.js";
export class CodingAgent {
    hermes;
    cf;
    executor;
    registry;
    workspaceRoot;
    activity;
    constructor(hermes, cf, executor, registry, workspaceRoot, activity) {
        this.hermes = hermes;
        this.cf = cf;
        this.executor = executor;
        this.registry = registry;
        this.workspaceRoot = workspaceRoot;
        this.activity = activity;
    }
    async run(instruction, ctx) {
        if (this.cf && this.executor && this.registry && ctx) {
            const agent = new AutonomousAgent(this.cf, this.executor, this.registry, this.workspaceRoot, this.activity);
            return agent.run(instruction, ctx, {
                classification: "coding",
                hint: [
                    "Prefer code.self_edit (Hermes) for repo changes.",
                    "Use filesystem.write for new files in the workspace.",
                    "Use tools.author to define reusable custom.* macros when the user wants a new capability.",
                ].join(" "),
            });
        }
        if (this.hermes) {
            const ok = await this.hermes.healthCheck();
            if (ok) {
                return this.hermes.chat(instruction, { sessionKey: "hermes-personal-os-coding" });
            }
        }
        if (this.cf) {
            return this.cf.chat(instruction, {
                classification: "coding",
                maxTokens: 4096,
                system: withAssistantPolicy("You are a senior engineer working on the Hermes Personal OS monorepo. Propose concrete file-level changes; use code.self_edit when execution is available."),
            });
        }
        return "Coding assistant unavailable. Set HERMES_API_URL + HERMES_API_KEY or Cloudflare credentials.";
    }
}
//# sourceMappingURL=coding-agent.js.map