import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import type { RequestClassification } from "../types.js";
import { findWorkspaceRoot } from "../workspace-root.js";

export type CloudflareModelRoutes = {
  default: string;
  routes: Partial<Record<RequestClassification | "default", string>>;
  hermes_providers?: Record<string, string>;
};

export function loadCloudflareModelRoutes(configPath?: string): CloudflareModelRoutes {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = configPath ?? resolve(root, "configs/cloudflare-models.yaml");
  const raw = parse(readFileSync(path, "utf8")) as CloudflareModelRoutes;
  return {
    default: raw.default ?? "@cf/zai-org/glm-4.7-flash",
    routes: raw.routes ?? {},
    hermes_providers: raw.hermes_providers,
  };
}

export class ModelRouter {
  constructor(private readonly routes: CloudflareModelRoutes) {}

  resolve(classification: RequestClassification): string {
    return (
      this.routes.routes[classification] ??
      this.routes.routes.default ??
      this.routes.default
    );
  }

  hermesModelCommand(classification: RequestClassification): string | null {
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
