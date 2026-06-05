import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { findWorkspaceRoot } from "../workspace-root.js";
import type { IntentCatalog, IntentCatalogEntry } from "./types.js";
import { REQUEST_CLASSIFICATIONS } from "./types.js";
import type { RequestClassification } from "../types.js";

export function loadIntentCatalog(configPath?: string): IntentCatalog {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = configPath ?? resolve(root, "configs/intents.yaml");
  const raw = parse(readFileSync(path, "utf8")) as IntentCatalog;
  return {
    classifier_model: raw.classifier_model ?? "@cf/meta/llama-3.2-3b-instruct",
    intents: raw.intents ?? [],
  };
}

export function listSupportedIntents(catalog?: IntentCatalog): IntentCatalogEntry[] {
  const c = catalog ?? loadIntentCatalog();
  return c.intents.filter((e) => REQUEST_CLASSIFICATIONS.includes(e.id));
}

export function isValidClassification(value: string): value is RequestClassification {
  return (REQUEST_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function formatIntentCatalogForPrompt(catalog: IntentCatalog): string {
  return catalog.intents
    .map(
      (e) =>
        `- ${e.id}: ${e.description.trim().replace(/\s+/g, " ")} (implemented: ${e.implemented})`,
    )
    .join("\n");
}
