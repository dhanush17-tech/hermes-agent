import type { ProductRecommendation } from "./types.js";

export function formatProductRecommendation(rec: ProductRecommendation): string {
  const lines: string[] = [];

  if (rec.userPreferencesUsed.length) {
    lines.push(
      `Using your remembered preferences: ${rec.userPreferencesUsed.join(", ")}.`,
      "",
    );
  } else if (rec.assumptions.length) {
    const assumptionIntro = rec.assumptions.find((a) => /don't know|assume|default/i.test(a));
    if (assumptionIntro) {
      lines.push(`${assumptionIntro}`, "");
    }
    lines.push(
      "Default assumptions:",
      ...rec.assumptions.filter((a) => !/don't know/i.test(a)).map((a) => `- ${a}`),
      "",
    );
  }

  lines.push(
    `Best all-around pick: ${rec.winner.title}`,
    `Link: ${rec.winner.url}`,
    "",
    "Why this one:",
  );

  const whyBullets = buildWhyBullets(rec);
  lines.push(...whyBullets.map((b) => `- ${b}`));

  if (rec.avoidIf?.length) {
    lines.push("", "Avoid it if:");
    lines.push(...rec.avoidIf.map((a) => `- ${a}`));
  }

  if (rec.alternatives.length) {
    const cheaper = rec.alternatives[0];
    const premium = rec.alternatives[1];
    if (cheaper) {
      lines.push("", "Cheaper alternative:", `${cheaper.title}`, cheaper.url);
    }
    if (premium) {
      lines.push("", "Premium alternative:", `${premium.title}`, premium.url);
    }
  }

  lines.push("", `Confidence: ${rec.confidence}.`);

  if (rec.unknowns.length) {
    lines.push(
      `I can make this much more accurate if you tell me ${rec.unknowns.slice(0, 2).join(" and ")}.`,
    );
  }

  return lines.join("\n");
}

function buildWhyBullets(rec: ProductRecommendation): string[] {
  const bullets: string[] = [];
  const w = rec.winner;

  if (w.features.some((f) => /adjustable/i.test(f))) {
    bullets.push("Adjustable fill makes it safer when sleep position is unknown.");
  }
  if (w.rating && w.reviewCount) {
    bullets.push(`Rated ${w.rating}/5 from ${w.reviewCount.toLocaleString()} reviews.`);
  }
  for (const ev of w.evidence.slice(0, 2)) {
    if (ev.strength === "strong" && !bullets.includes(ev.claim)) bullets.push(ev.claim);
  }
  if (bullets.length === 0) bullets.push(rec.reasoning);

  return bullets.slice(0, 5);
}

export function explainRecommendation(rec: ProductRecommendation, question: string): string {
  const lower = question.toLowerCase();
  const lines: string[] = [];

  if (/how did you decide|why this one|is this right|what assumptions/i.test(lower)) {
    lines.push("Here's how I decided:");
    if (rec.userPreferencesUsed.length) {
      lines.push(`Preferences used: ${rec.userPreferencesUsed.join(", ")}.`);
    } else {
      lines.push("I did not have enough personal memory for a fully personalized pick.");
    }
    if (rec.assumptions.length) {
      lines.push(`Assumptions: ${rec.assumptions.join("; ")}.`);
    }
    lines.push(`Reasoning: ${rec.reasoning}`);
    lines.push(`Confidence: ${rec.confidence}.`);
    if (rec.unknowns.length) {
      lines.push(`Still unknown: ${rec.unknowns.join(", ")}.`);
    }
    return lines.join("\n");
  }

  return explainRecommendation(rec, "how did you decide");
}

export function formatCheaperAlternative(rec: ProductRecommendation, alt: ProductRecommendation["winner"]): string {
  return [
    `Cheaper alternative: ${alt.title}`,
    `Link: ${alt.url}`,
    alt.price ? `Price: $${alt.price}` : "",
    `Compared to ${rec.winner.title}, this is a lower-cost option in the same category.`,
    `Confidence: ${rec.confidence}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
