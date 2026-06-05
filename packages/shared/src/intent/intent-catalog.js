import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { findWorkspaceRoot } from "../workspace-root.js";
import { REQUEST_CLASSIFICATIONS } from "./types.js";
export function loadIntentCatalog(configPath) {
    const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
    const path = configPath ?? resolve(root, "configs/intents.yaml");
    const raw = parse(readFileSync(path, "utf8"));
    return {
        classifier_model: raw.classifier_model ?? "@cf/meta/llama-3.2-3b-instruct",
        intents: raw.intents ?? [],
    };
}
export function listSupportedIntents(catalog) {
    const c = catalog ?? loadIntentCatalog();
    return c.intents.filter((e) => REQUEST_CLASSIFICATIONS.includes(e.id));
}
export function isValidClassification(value) {
    return REQUEST_CLASSIFICATIONS.includes(value);
}
export function formatIntentCatalogForPrompt(catalog) {
    return catalog.intents
        .map((e) => `- ${e.id}: ${e.description.trim().replace(/\s+/g, " ")} (implemented: ${e.implemented})`)
        .join("\n");
}
//# sourceMappingURL=intent-catalog.js.map