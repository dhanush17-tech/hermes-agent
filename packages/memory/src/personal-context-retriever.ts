import type { MemoryService } from "./memory-service.js";

export type PersonalizationContext = {
  preferences: string[];
  constraints: string[];
  unknowns: string[];
  confidence: "low" | "medium" | "high";
};

const ALLOWED_MEMORY_TYPES = new Set([
  "preferences",
  "durable_facts",
  "user_preference",
  "shopping_preference",
  "product_feedback",
  "health_preference",
  "lifestyle_preference",
  "decision",
]);

const DENIED_CONTENT_PATTERNS = [
  /\bslack\b/i,
  /\bzelle\b/i,
  /\bsecurity alert\b/i,
  /\bphishing\b/i,
  /\bcalendar\b/i,
  /\bunrelated\b/i,
  /\bfounder\b/i,
  /\bdevlabs\b/i,
  /\bmomentum\b/i,
  /\bdemo day\b/i,
  /\binvestor\b/i,
  /\bstartup\b/i,
  /\bfounder[- ]?energy\b/i,
  /\bvibe\b/i,
];

const CATEGORY_EXPANSIONS: Record<string, string[]> = {
  pillow: [
    "sleep position side back stomach sleeper",
    "pillow firmness soft medium firm",
    "neck pain cervical",
    "allergies down feather latex",
    "pillow material memory foam",
    "budget pillow",
    "retailer preference shipping",
  ],
  monitor: ["monitor size resolution refresh rate budget", "desk setup preference"],
  laptop: ["laptop use case budget portability", "operating system preference"],
  headphones: ["headphones wireless noise cancelling budget", "audio preference"],
  desk: ["standing desk height budget office setup"],
  skincare: [
    "skin type oily dry sensitive combination",
    "moisturizer skincare serum cleanser sunscreen",
    "acne redness anti-aging fragrance-free",
    "skincare budget preference",
  ],
};

const CATEGORY_KEY_PREFS: Record<string, string[]> = {
  pillow: ["sleep position", "budget", "firmness", "material/allergy", "neck pain"],
  monitor: ["size", "resolution", "budget", "use case"],
  laptop: ["budget", "use case", "portability", "OS preference"],
  headphones: ["budget", "wireless", "noise cancelling", "use case"],
  desk: ["budget", "height range", "desk size"],
  skincare: ["skin type", "concerns", "budget"],
};

function isRelevantMemory(content: string, memoryType: string, query: string): boolean {
  if (!ALLOWED_MEMORY_TYPES.has(memoryType)) return false;
  if (DENIED_CONTENT_PATTERNS.some((re) => re.test(content))) return false;
  const blob = `${content} ${query}`.toLowerCase();
  if (/\b(pillow|sleep|bedding)\b/i.test(query)) {
    return /\b(pillow|sleep|sleeper|firm|soft|neck|allerg|bedding|mattress)\b/i.test(blob);
  }
  if (/\b(moisturizer|moisturiser|skincare|serum|cleanser|sunscreen)\b/i.test(query)) {
    return /\b(skin|oily|dry|sensitive|combination|moistur|spf|acne|skincare|serum|cleanser|fragrance)\b/i.test(
      blob,
    );
  }
  if (/\b(laptop|monitor|headphones|desk)\b/i.test(query)) {
    return /\b(laptop|monitor|headphones|desk|computer|display|audio|office)\b/i.test(blob);
  }
  return /\b(prefer|preference|like|want|budget|buy|shop)\b/i.test(blob) && !DENIED_CONTENT_PATTERNS.some((re) => re.test(content));
}

function extractPreferenceStatements(content: string): { preferences: string[]; constraints: string[] } {
  const preferences: string[] = [];
  const constraints: string[] = [];

  if (/side\s*sleeper/i.test(content)) preferences.push("side sleeper");
  if (/back\s*sleeper/i.test(content)) preferences.push("back sleeper");
  if (/stomach\s*sleeper/i.test(content)) preferences.push("stomach sleeper");
  if (/\bsoft\b/i.test(content)) preferences.push("prefers soft");
  if (/\bfirm\b/i.test(content)) preferences.push("prefers firm");
  if (/neck pain/i.test(content)) preferences.push("neck pain");
  if (/allerg/i.test(content)) constraints.push("allergies mentioned");
  if (/down pillow|feather/i.test(content)) constraints.push("down/feather sensitivity possible");
  if (/under \$\d+/i.test(content)) {
    const m = content.match(/under \$(\d+)/i);
    if (m) constraints.push(`budget under $${m[1]}`);
  }
  if (/prefer.*amazon/i.test(content)) preferences.push("prefers Amazon");
  if (/memory foam/i.test(content)) preferences.push("memory foam ok");
  if (/\boily\s*skin\b/i.test(content)) preferences.push("oily skin");
  if (/\bdry\s*skin\b/i.test(content)) preferences.push("dry skin");
  if (/\bsensitive\s*skin\b/i.test(content)) preferences.push("sensitive skin");
  if (/\bcombination\s*skin\b/i.test(content)) preferences.push("combination skin");
  if (/\bnormal\s*skin\b/i.test(content)) preferences.push("normal skin");

  if (preferences.length === 0 && /prefer/i.test(content)) {
    const trimmed = content.slice(0, 120).trim();
    if (trimmed.length > 10) preferences.push(trimmed);
  }

  return { preferences: [...new Set(preferences)], constraints: [...new Set(constraints)] };
}

function detectCategory(query: string): string | undefined {
  if (/\b(pillow|piilow|bedding|sleep)\b/i.test(query)) return "pillow";
  if (/\bmonitor\b/i.test(query)) return "monitor";
  if (/\blaptop\b/i.test(query)) return "laptop";
  if (/\bheadphones?\b/i.test(query)) return "headphones";
  if (/\bdesk\b/i.test(query)) return "desk";
  if (/\b(moisturizer|moisturiser|skincare|serum|cleanser|sunscreen)\b/i.test(query)) return "skincare";
  return undefined;
}

export async function getProductPersonalizationContext(
  query: string,
  memory: MemoryService,
  category?: string,
): Promise<PersonalizationContext> {
  const cat = category ?? detectCategory(query) ?? "general";
  const searchTerms = [query, ...(CATEGORY_EXPANSIONS[cat] ?? [`${cat} preferences`])];

  const rows: Array<{ content: string; memoryType: string }> = [];
  const seen = new Set<string>();

  for (const term of searchTerms) {
    const hits = await memory.searchForContext(term, 8);
    for (const row of hits) {
      if (seen.has(row.content)) continue;
      if (!isRelevantMemory(row.content, row.memoryType, query)) continue;
      seen.add(row.content);
      rows.push(row);
    }
    if (rows.length >= 10) break;
  }

  const preferences: string[] = [];
  const constraints: string[] = [];

  for (const row of rows) {
    const extracted = extractPreferenceStatements(row.content);
    preferences.push(...extracted.preferences);
    constraints.push(...extracted.constraints);
  }

  const uniquePrefs = [...new Set(preferences)].slice(0, 8);
  const uniqueConstraints = [...new Set(constraints)].slice(0, 6);

  const keyPrefs = CATEGORY_KEY_PREFS[cat] ?? ["budget", "use case"];
  const knownKeys = countKnownKeyPreferences(uniquePrefs, uniqueConstraints, keyPrefs);
  const unknowns = keyPrefs.filter((k) => !isKeyKnown(k, uniquePrefs, uniqueConstraints));

  let confidence: PersonalizationContext["confidence"] = "low";
  if (knownKeys >= 3) confidence = "high";
  else if (knownKeys >= 2) confidence = "medium";

  return {
    preferences: uniquePrefs,
    constraints: uniqueConstraints,
    unknowns,
    confidence,
  };
}

function countKnownKeyPreferences(
  preferences: string[],
  constraints: string[],
  keyPrefs: string[],
): number {
  return keyPrefs.filter((k) => isKeyKnown(k, preferences, constraints)).length;
}

function isKeyKnown(key: string, preferences: string[], constraints: string[]): boolean {
  const blob = `${preferences.join(" ")} ${constraints.join(" ")}`.toLowerCase();
  if (key.includes("sleep position")) {
    return /\b(side|back|stomach)\s*sleeper\b/i.test(blob);
  }
  if (key.includes("budget")) return /\bbudget\b|\$\d+/i.test(blob);
  if (key.includes("firmness")) return /\b(soft|firm|medium)\b/i.test(blob);
  if (key.includes("material") || key.includes("allergy")) {
    return /\b(allerg|down|latex|memory foam|material)\b/i.test(blob);
  }
  if (key.includes("neck")) return /neck/i.test(blob);
  if (key.includes("wireless")) return /wireless|bluetooth/i.test(blob);
  if (key.includes("noise")) return /noise/i.test(blob);
  if (key.includes("skin type")) {
    return /\b(oily|dry|normal|combination|sensitive)\s*skin\b/i.test(blob);
  }
  if (key.includes("concerns")) {
    return /\b(acne|redness|anti[- ]?aging|rosacea|hydration)\b/i.test(blob);
  }
  return blob.includes(key.toLowerCase());
}
