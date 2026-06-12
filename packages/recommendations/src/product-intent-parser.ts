import type { ProductRecommendationInput } from "./types.js";

const CATEGORY_PATTERNS: Array<{ re: RegExp; category: string }> = [
  { re: /\b(moisturizer|moisturiser|skincare|cleanser|sunscreen|serum|face cream)\b/i, category: "skincare" },
  { re: /\b(pillow|piilow)\b/i, category: "pillow" },
  { re: /\b(monitor|display)\b/i, category: "monitor" },
  { re: /\b(laptop|notebook)\b/i, category: "laptop" },
  { re: /\b(headphones?|earbuds?)\b/i, category: "headphones" },
  { re: /\b(standing desk|desk)\b/i, category: "desk" },
  { re: /\b(mattress|bedding)\b/i, category: "mattress" },
  { re: /\b(chair)\b/i, category: "chair" },
  { re: /\b(keyboard)\b/i, category: "keyboard" },
  { re: /\b(mouse)\b/i, category: "mouse" },
  { re: /\b(iphone|smartphone|android phone|pixel|galaxy)\b/i, category: "phone" },
];

export function parseProductIntent(query: string): ProductRecommendationInput {
  const input: ProductRecommendationInput = { query: query.trim() };

  for (const { re, category } of CATEGORY_PATTERNS) {
    if (re.test(query)) {
      input.category = category;
      break;
    }
  }

  const budgetMax = query.match(/\bunder\s+\$?(\d+)/i)?.[1];
  const budgetRange = query.match(/\$?(\d+)\s*[-–]\s*\$?(\d+)/);
  if (budgetMax) {
    input.budget = { max: Number(budgetMax) };
  } else if (budgetRange) {
    input.budget = { min: Number(budgetRange[1]), max: Number(budgetRange[2]) };
  }

  const retailers: string[] = [];
  if (/\bamazon\b/i.test(query)) retailers.push("Amazon");
  if (/\bwalmart\b/i.test(query)) retailers.push("Walmart");
  if (/\btarget\b/i.test(query)) retailers.push("Target");
  if (/\bbest buy\b/i.test(query)) retailers.push("Best Buy");
  if (retailers.length) input.preferredRetailers = retailers;

  const constraints: string[] = [];
  if (/\b(wireless|bluetooth)\b/i.test(query)) constraints.push("wireless");
  if (/\b(ergonomic)\b/i.test(query)) constraints.push("ergonomic");
  if (/\boily\s*skin\b/i.test(query)) constraints.push("oily skin");
  if (/\bdry\s*skin\b/i.test(query)) constraints.push("dry skin");
  if (/\bsensitive\s*skin\b/i.test(query)) constraints.push("sensitive skin");
  if (constraints.length) input.userConstraints = constraints;

  return input;
}

export function wantsImmediateLink(query: string): boolean {
  return /\b(give me|send me|get me|link|url|could you give|best .{0,30}to buy|buy me|want to buy)\b/i.test(query);
}
