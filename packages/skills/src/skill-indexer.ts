import { createHash } from "node:crypto";
import { createDb, runMigrations } from "@hermes-os/context-graph";
import { smAdd, smDelete, smSearch } from "@hermes-os/memory";
import type { SkillDefinition, SkillMatch } from "./types.js";

const SKIP_SKILL_DISPATCH_RE =
  /\b(go ahead|goa ahead|yeah|yes|ok|okay|done|continue|resume|try again|try agan|proceed|ready|logged in)\b/i;

export function skillContainerTag(): string {
  return (
    process.env.SUPERMEMORY_SKILL_CONTAINER?.trim() ??
    process.env.SUPERMEMORY_CONTAINER_TAG?.trim() ??
    "hermes_skills"
  );
}

export function skillMatchThreshold(): number {
  return Number(process.env.SKILL_MATCH_THRESHOLD ?? 0.72);
}

function getSqlite() {
  const { sqlite } = createDb();
  runMigrations(sqlite);
  return sqlite;
}

function indexContent(skill: SkillDefinition): string {
  const triggers = skill.triggerExamples.join("; ");
  const tools = skill.steps.map((s) => s.tool).join(", ");
  return [
    `Skill: ${skill.name}`,
    `Description: ${skill.description}`,
    `Triggers: ${triggers}`,
    `Tools: ${tools}`,
  ].join("\n");
}

function contentHash(skill: SkillDefinition): string {
  return createHash("sha256").update(indexContent(skill)).digest("hex");
}

export function needsReindex(skill: SkillDefinition): boolean {
  const hash = contentHash(skill);
  const row = getSqlite()
    .prepare("SELECT hash FROM skill_index_hashes WHERE name = ?")
    .get(skill.name) as { hash: string } | undefined;
  return !row || row.hash !== hash;
}

function upsertHash(name: string, hash: string): void {
  getSqlite()
    .prepare("INSERT OR REPLACE INTO skill_index_hashes (name, hash) VALUES (?, ?)")
    .run(name, hash);
}

function deleteHash(name: string): void {
  getSqlite().prepare("DELETE FROM skill_index_hashes WHERE name = ?").run(name);
}

function skillNameFromHit(hit: { metadata: Record<string, string | undefined>; content: string }): string | null {
  const tagged = hit.metadata.skill_name?.trim();
  if (tagged) return tagged;
  const tags = hit.metadata.tags?.split(",").map((t) => t.trim()) ?? [];
  const skillTag = tags.find((t) => t.startsWith("skill."));
  if (skillTag) return skillTag;
  const match = hit.content.match(/^Skill:\s*(skill\.[^\n]+)/m);
  return match?.[1]?.trim() ?? null;
}

export async function indexSkill(skill: SkillDefinition): Promise<boolean> {
  if (skill.status !== "active") return false;
  if (!needsReindex(skill)) return false;

  await deindexSkill(skill.name);

  await smAdd(
    indexContent(skill),
    {
      memory_type: "skill",
      source: "skill_indexer",
      tags: `skill,${skill.name}`,
      skill_name: skill.name,
      preferred: skill.preferred ? "true" : "false",
    },
    skillContainerTag(),
  );

  upsertHash(skill.name, contentHash(skill));
  return true;
}

export async function deindexSkill(skillName: string): Promise<void> {
  const hits = await smSearch(skillName, {
    containerTag: skillContainerTag(),
    limit: 10,
    filterTags: [skillName],
    minScore: 0,
  });

  const seen = new Set<string>();
  for (const hit of hits) {
    if (skillNameFromHit(hit) !== skillName) continue;
    if (!hit.id || seen.has(hit.id)) continue;
    seen.add(hit.id);
    await smDelete(hit.id).catch(() => undefined);
  }

  deleteHash(skillName);
}

export async function matchSkillSemantically(
  message: string,
  skills: SkillDefinition[],
  threshold = skillMatchThreshold(),
): Promise<SkillMatch | null> {
  const normalized = message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  if (SKIP_SKILL_DISPATCH_RE.test(normalized) && normalized.split(" ").length <= 4) return null;

  const active = skills.filter((s) => s.status === "active");
  if (active.length === 0) return null;

  const activeByName = new Map(active.map((s) => [s.name, s]));
  let hits: Awaited<ReturnType<typeof smSearch>> = [];
  try {
    hits = await smSearch(message, {
      containerTag: skillContainerTag(),
      limit: 10,
      minScore: threshold,
    });
  } catch {
    return null;
  }

  let best: SkillMatch | null = null;
  for (const hit of hits) {
    const skillName = skillNameFromHit(hit);
    if (!skillName) continue;
    const skill = activeByName.get(skillName);
    if (!skill || hit.score < threshold) continue;

    const preferredBoost = skill.preferred ? 0.02 : 0;
    const score = hit.score + preferredBoost;

    if (!best || score > best.score) {
      best = {
        skill,
        score,
        matchedTrigger: hit.content.split("\n")[0]?.slice(0, 120) ?? skill.name,
      };
    } else if (best && score === best.score && skill.preferred && !best.skill.preferred) {
      best = {
        skill,
        score,
        matchedTrigger: hit.content.split("\n")[0]?.slice(0, 120) ?? skill.name,
      };
    }
  }

  return best;
}
