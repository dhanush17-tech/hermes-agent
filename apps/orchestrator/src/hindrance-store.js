import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { generateId } from "@hermes-os/shared";
export class HindranceStore {
    path;
    constructor(workspaceRoot) {
        this.path = join(workspaceRoot, "data", "pending-hindrance.json");
    }
    async getActive() {
        try {
            const raw = await readFile(this.path, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    /** Returns null if same category already waiting (no duplicate alerts). */
    async report(input) {
        const existing = await this.getActive();
        if (existing?.category === input.category) {
            return null;
        }
        const hindrance = {
            id: generateId("hindrance"),
            category: input.category,
            issue: input.issue,
            question: input.question,
            resolutionHint: input.resolutionHint,
            userNotified: false,
            createdAt: new Date().toISOString(),
        };
        await mkdir(join(this.path, ".."), { recursive: true });
        await writeFile(this.path, JSON.stringify(hindrance, null, 2), "utf8");
        return hindrance;
    }
    async markNotified() {
        const h = await this.getActive();
        if (!h)
            return;
        h.userNotified = true;
        await writeFile(this.path, JSON.stringify(h, null, 2), "utf8");
    }
    async clear() {
        try {
            await unlink(this.path);
        }
        catch {
            /* ok */
        }
    }
    isResumeMessage(text) {
        return /\b(done|fixed|granted|continue|resume|retry|ok|ready|go ahead|try again|request again)\b/i.test(text.trim());
    }
}
//# sourceMappingURL=hindrance-store.js.map