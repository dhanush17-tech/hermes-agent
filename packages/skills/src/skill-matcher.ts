import { matchSkillSemantically, skillMatchThreshold } from "./skill-indexer.js";
import type { SkillDefinition, SkillMatch } from "./types.js";

export const MIN_MATCH_SCORE = skillMatchThreshold();

const SKIP_SKILL_DISPATCH_RE =
  /\b(go ahead|goa ahead|yeah|yes|ok|okay|done|continue|resume|try again|try agan|proceed|ready|logged in)\b/i;

export async function matchSkills(message: string, skills: SkillDefinition[]): Promise<SkillMatch | null> {
  const semantic = await matchSkillSemantically(message, skills);
  if (semantic) return semantic;
  return matchSkillsLexical(message, skills);
}

function matchSkillsLexical(message: string, skills: SkillDefinition[]): SkillMatch | null {
  const normalized = normalizeText(message);
  if (!normalized) return null;
  if (SKIP_SKILL_DISPATCH_RE.test(normalized) && normalized.split(" ").length <= 4) return null;

  let best: SkillMatch | null = null;

  for (const skill of skills) {
    if (skill.status !== "active") continue;
    for (const trigger of skill.triggerExamples) {
      const score = scoreTrigger(normalized, trigger);
      if (score < MIN_MATCH_SCORE) continue;
      const preferredBoost = skill.preferred ? 0.02 : 0;
      const adjusted = score + preferredBoost;
      if (!best || adjusted > best.score) {
        best = { skill, score: adjusted, matchedTrigger: trigger };
      }
    }
    const nameScore = scoreTrigger(normalized, skill.name.replace(/\./g, " "));
    const adjustedName = nameScore + (skill.preferred ? 0.02 : 0);
    if (nameScore >= MIN_MATCH_SCORE && (!best || adjustedName > best.score)) {
      best = { skill, score: adjustedName, matchedTrigger: skill.name };
    }
  }

  return best;
}

export function scoreTrigger(message: string, trigger: string): number {
  const t = normalizeText(trigger);
  if (!t) return 0;
  if (message === t) return 1;
  if (message.includes(t)) return 0.85 + Math.min(0.1, t.length / 200);

  const triggerTokens = tokenize(t);
  const messageTokens = new Set(tokenize(message));
  if (triggerTokens.length === 0) return 0;

  let hits = 0;
  for (const token of triggerTokens) {
    if (messageTokens.has(token)) hits += 1;
  }
  const coverage = hits / triggerTokens.length;
  if (coverage < 0.5) return 0;
  return 0.45 + coverage * 0.4;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 2);
}
