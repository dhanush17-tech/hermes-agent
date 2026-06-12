import { readFile, writeFile, mkdir, readdir, rename } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { skillDefinitionSchema, type SkillDefinition } from "./types.js";

const SKILL_FILE_SUFFIX = ".skill.json";

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  constructor(
    private readonly activeDir: string,
    private readonly sandboxDir: string,
  ) {}

  loadFromDiskSync(): number {
    this.skills.clear();
    let count = 0;
    for (const dir of [this.activeDir, this.sandboxDir]) {
      count += this.loadDirSync(dir);
    }
    return count;
  }

  async loadFromDisk(): Promise<number> {
    this.skills.clear();
    let count = 0;
    for (const dir of [this.activeDir, this.sandboxDir]) {
      count += await this.loadDir(dir);
    }
    return count;
  }

  register(skill: SkillDefinition): void {
    const parsed = skillDefinitionSchema.parse(skill);
    this.skills.set(parsed.name, parsed);
  }

  get(name: string): SkillDefinition | undefined {
    return this.skills.get(name);
  }

  list(status?: SkillDefinition["status"]): SkillDefinition[] {
    const all = [...this.skills.values()];
    return status ? all.filter((s) => s.status === status) : all;
  }

  listActive(): SkillDefinition[] {
    return this.list("active");
  }

  async persist(skill: SkillDefinition, target: "active" | "sandbox" = "active"): Promise<string> {
    const parsed = skillDefinitionSchema.parse(skill);
    const dir = target === "sandbox" ? this.sandboxDir : this.activeDir;
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${slugify(parsed.name)}${SKILL_FILE_SUFFIX}`);
    await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    this.skills.set(parsed.name, parsed);
    return filePath;
  }

  async promoteFromSandbox(name: string): Promise<SkillDefinition> {
    const skill = this.skills.get(name);
    if (!skill) throw new Error(`Skill not found: ${name}`);
    if (skill.status !== "sandbox" && skill.status !== "draft") {
      return skill;
    }
    const promoted: SkillDefinition = {
      ...skill,
      status: "active",
      updatedAt: new Date().toISOString(),
    };
    const sandboxPath = join(this.sandboxDir, `${slugify(name)}${SKILL_FILE_SUFFIX}`);
    await this.persist(promoted, "active");
    if (existsSync(sandboxPath)) {
      const { unlink } = await import("node:fs/promises");
      await unlink(sandboxPath).catch(() => undefined);
    }
    return promoted;
  }

  async recordRun(name: string, success: boolean): Promise<void> {
    const skill = this.skills.get(name);
    if (!skill) return;
    const updated: SkillDefinition = {
      ...skill,
      updatedAt: new Date().toISOString(),
      lastSuccessfulRun: success ? new Date().toISOString() : skill.lastSuccessfulRun,
      failureCount: success ? 0 : (skill.failureCount ?? 0) + 1,
    };
    const target = skill.status === "active" ? "active" : "sandbox";
    await this.persist(updated, target);
  }

  private loadDirSync(dir: string): number {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        return 0;
      }
      let count = 0;
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (!ent.isFile() || !ent.name.endsWith(SKILL_FILE_SUFFIX)) continue;
        const raw = readFileSync(join(dir, ent.name), "utf8");
        const skill = skillDefinitionSchema.parse(JSON.parse(raw));
        this.skills.set(skill.name, skill);
        count += 1;
      }
      return count;
    } catch {
      return 0;
    }
  }

  private async loadDir(dir: string): Promise<number> {
    try {
      await mkdir(dir, { recursive: true });
      const entries = await readdir(dir, { withFileTypes: true });
      let count = 0;
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith(SKILL_FILE_SUFFIX)) continue;
        const raw = await readFile(join(dir, ent.name), "utf8");
        const skill = skillDefinitionSchema.parse(JSON.parse(raw));
        this.skills.set(skill.name, skill);
        count += 1;
      }
      return count;
    } catch {
      return 0;
    }
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function moveSkillCandidateToSandbox(
  candidatePath: string,
  sandboxDir: string,
  skill: SkillDefinition,
): Promise<string> {
  await mkdir(sandboxDir, { recursive: true });
  const out = join(sandboxDir, `${slugify(skill.name)}.skill.json`);
  await writeFile(out, `${JSON.stringify(skill, null, 2)}\n`, "utf8");
  const archived = candidatePath.replace(/\.json$/, `.promoted-${Date.now()}.json`);
  await rename(candidatePath, archived).catch(() => undefined);
  return out;
}
