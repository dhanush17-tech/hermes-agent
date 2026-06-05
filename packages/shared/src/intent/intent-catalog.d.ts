import type { IntentCatalog, IntentCatalogEntry } from "./types.js";
import type { RequestClassification } from "../types.js";
export declare function loadIntentCatalog(configPath?: string): IntentCatalog;
export declare function listSupportedIntents(catalog?: IntentCatalog): IntentCatalogEntry[];
export declare function isValidClassification(value: string): value is RequestClassification;
export declare function formatIntentCatalogForPrompt(catalog: IntentCatalog): string;
//# sourceMappingURL=intent-catalog.d.ts.map