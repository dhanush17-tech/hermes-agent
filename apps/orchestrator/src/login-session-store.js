import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
export class LoginSessionStore {
    path;
    constructor(workspaceRoot) {
        this.path = join(workspaceRoot, "data", "pending-login.json");
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
        const dir = join(this.path, "..");
        await mkdir(dir, { recursive: true });
        await writeFile(this.path, JSON.stringify(session, null, 2), "utf8");
    }
    async clear() {
        try {
            await unlink(this.path);
        }
        catch {
            // already cleared
        }
    }
}
//# sourceMappingURL=login-session-store.js.map