const SKIN_TYPES = ["oily", "dry", "normal", "combination", "sensitive"] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

const IRRELEVANT_MEMORY_RE =
  /\b(founder|devlabs|momentum|startup|investor|tweet|email|slack|vibe|energy|builder|demo day|community)\b/i;

export function isIrrelevantProductMemory(content: string): boolean {
  return IRRELEVANT_MEMORY_RE.test(content);
}

export function extractSkinType(text: string): SkinType | null {
  const t = text.toLowerCase();
  if (/\b(combination|combo)\s*skin\b/i.test(t) || /\bcombination\b/i.test(t)) return "combination";
  if (/\boily\s*skin\b/i.test(t) || /\bi\s*(?:have|got|am)\s*oily\b/i.test(t)) return "oily";
  if (/\bdry\s*skin\b/i.test(t) || /\bi\s*(?:have|got|am)\s*dry\b/i.test(t)) return "dry";
  if (/\bsensitive\s*skin\b/i.test(t) || /\bi\s*(?:have|got|am)\s*sensitive\b/i.test(t)) return "sensitive";
  if (/\bnormal\s*skin\b/i.test(t) || /\bi\s*(?:have|got|am)\s*normal\b/i.test(t)) return "normal";
  return null;
}

export function extractInlineProductPreferences(
  query: string,
  category: string,
): { preferences: string[]; constraints: string[] } {
  const preferences: string[] = [];
  const constraints: string[] = [];

  if (category === "skincare" || /\b(moisturizer|skincare|serum|cleanser|sunscreen)\b/i.test(query)) {
    const skin = extractSkinType(query);
    if (skin) preferences.push(`${skin} skin`);
    if (/\bacne\b/i.test(query)) constraints.push("acne-prone");
    if (/\b(redness|rosacea)\b/i.test(query)) constraints.push("redness/rosacea");
    if (/\banti[- ]?aging\b/i.test(query)) constraints.push("anti-aging");
    if (/\bfragrance[- ]?free\b/i.test(query)) constraints.push("fragrance-free");
    if (/\bspf\b/i.test(query)) constraints.push("needs SPF");
  }

  const budget = query.match(/\bunder\s+\$?(\d+)/i);
  if (budget) constraints.push(`budget under $${budget[1]}`);

  return { preferences, constraints };
}

export function filterCategoryPreferences(preferences: string[], category: string): string[] {
  return preferences.filter((p) => {
    if (isIrrelevantProductMemory(p)) return false;
    if (category === "skincare") {
      return /\b(skin|oily|dry|normal|sensitive|combination|acne|moistur|spf|fragrance|skincare)\b/i.test(p);
    }
    if (category === "pillow") {
      return /\b(sleep|sleeper|pillow|firm|soft|neck|allerg)\b/i.test(p);
    }
    return !isIrrelevantProductMemory(p);
  });
}

export function buildClarificationQuestion(
  category: string,
  unknowns: string[],
  query: string,
): string {
  const productLabel = category === "skincare" ? "moisturizer" : category === "general" ? "product" : category;
  const inline = extractInlineProductPreferences(query, category);

  if (category === "skincare") {
    const missing: string[] = [];
    if (!inline.preferences.some((p) => /skin/i.test(p))) {
      missing.push("skin type (oily, dry, normal, combination, or sensitive)");
    }
    if (!unknowns.length && missing.length === 0) {
      missing.push("main concern (hydration, acne, redness, anti-aging)");
    }
    for (const u of unknowns) {
      if (!missing.some((m) => m.toLowerCase().includes(u.split(" ")[0] ?? ""))) {
        missing.push(u);
      }
    }
    const questions = missing.slice(0, 2);
    return [
      `To recommend the right ${productLabel} for you, I need a bit more info:`,
      ...questions.map((q, i) => `${i + 1}. ${q.charAt(0).toUpperCase() + q.slice(1)}?`),
      "",
      "I'll remember your answers for next time.",
    ].join("\n");
  }

  const unknownList = unknowns.slice(0, 2).join(" and ") || "budget and main use case";
  return `To recommend the best ${productLabel} for you, what is your ${unknownList}? I'll remember it for next time.`;
}

export function parseClarificationReply(text: string, category: string): { preferences: string[]; constraints: string[] } {
  const trimmed = text.trim();
  const fromInline = extractInlineProductPreferences(trimmed, category);

  if (category === "skincare" && fromInline.preferences.length === 0) {
    const lower = trimmed.toLowerCase();
    for (const skin of SKIN_TYPES) {
      if (lower === skin || lower.startsWith(`${skin} `) || lower.includes(skin)) {
        fromInline.preferences.push(`${skin} skin`);
        break;
      }
    }
  }

  if (/\bunder\s+\$?\d+/i.test(trimmed)) {
    const m = trimmed.match(/\bunder\s+\$?(\d+)/i);
    if (m) fromInline.constraints.push(`budget under $${m[1]}`);
  }

  return fromInline;
}

export function memoryStatementsFromPreferences(
  preferences: string[],
  constraints: string[],
  category: string,
): string[] {
  const lines: string[] = [];
  for (const p of preferences) {
    lines.push(`Product preference (${category}): ${p}`);
  }
  for (const c of constraints) {
    lines.push(`Product constraint (${category}): ${c}`);
  }
  return lines;
}

export function isLikelyClarificationReply(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 280) return false;
  if (/\?/.test(t) && t.length > 80) return false;
  if (
    /\b(oily|dry|normal|sensitive|combination|acne|redness|under\s+\$\d+|fragrance[- ]?free|side sleeper|back sleeper)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return t.split(/\s+/).length <= 12;
}
