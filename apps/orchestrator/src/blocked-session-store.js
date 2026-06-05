import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
export class BlockedSessionStore {
    path;
    constructor(workspaceRoot) {
        this.path = join(workspaceRoot, "data", "pending-blocked.json");
    }
    async get() {
        try {
            const raw = await readFile(this.path, "utf8");
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    async save(session) {
        await mkdir(join(this.path, ".."), { recursive: true });
        await writeFile(this.path, JSON.stringify(session, null, 2), "utf8");
    }
    async clear() {
        try {
            await unlink(this.path);
        }
        catch {
            /* ok */
        }
    }
}
//# sourceMappingURL=blocked-session-store.js.map