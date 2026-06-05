/** Returns a normalized 0–100 proactive score (spec §10.2). */
export function computeProactiveScore(
  impact: number,
  urgency: number,
  confidence: number,
  annoyancePenalty: number,
): number {
  const clamp10 = (n: number) => Math.max(0, Math.min(10, n));
  const conf = confidence <= 1 ? confidence * 10 : clamp10(confidence);
  const product = clamp10(impact) * clamp10(urgency) * clamp10(conf);
  const penalty = clamp10(annoyancePenalty);
  return Math.min(100, Math.max(0, Math.round(product - penalty)));
}
