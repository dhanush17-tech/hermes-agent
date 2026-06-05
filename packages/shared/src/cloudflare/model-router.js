import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { findWorkspaceRoot } from "../workspace-root.js";
export function loadCloudflareModelRoutes(configPath) {
    const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
    const path = configPath ?? resolve(root, "configs/cloudflare-models.yaml");
    const raw = parse(readFileSync(path, "utf8"));
    return {
        default: raw.default ?? "@cf/zai-org/glm-4.7-flash",
        routes: raw.routes ?? {},
        hermes_providers: raw.hermes_providers,
    };
}
export class ModelRouter {
    routes;
    constructor(routes) {
        this.routes = routes;
    }
    resolve(classification) {
        return (this.routes.routes[classification] ??
            this.routes.routes.default ??
            this.routes.default);
    }
    hermesModelCommand(classification) {
        const model = this.resolve(classification);
        const providers = this.routes.hermes_providers ?? {};
        for (const [name, id] of Object.entries(providers)) {
            if (id === model) {
                return `/model custom:${name}:${model}`;
            }
        }
        return null;
    }
}
//# sourceMappingURL=model-router.js.map