import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type MacroStep = {
  tool: string;
  payload: unknown;
  summary?: string;
};

export type ToolMacro = {
  name: string;
  description: string;
  steps: MacroStep[];
  createdAt: string;
};

export class MacroRegistry {
  private readonly macros = new Map<string, ToolMacro>();

  constructor(private readonly dir: string) {}

  loadFromDiskSync(): number {
    this.macros.clear();
    try {
      if (!existsSync(this.dir)) {
        mkdirSync(this.dir, { recursive: true });
        return 0;
      }
      const entries = readdirSync(this.dir, { withFileTypes: true });
      let count = 0;
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith(".macro.json")) continue;
        const raw = readFileSync(join(this.dir, ent.name), "utf8");
        const macro = JSON.parse(raw) as ToolMacro;
        if (macro.name && macro.steps?.length) {
          this.macros.set(macro.name, macro);
          count += 1;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  async loadFromDisk(): Promise<number> {
    this.macros.clear();
    try {
      await mkdir(this.dir, { recursive: true });
      const entries = await readdir(this.dir, { withFileTypes: true });
      let count = 0;
      for (const ent of entries) {
        if (!ent.isFile() || !ent.name.endsWith(".macro.json")) continue;
        const raw = await readFile(join(this.dir, ent.name), "utf8");
        const macro = JSON.parse(raw) as ToolMacro;
        if (macro.name && macro.steps?.length) {
          this.macros.set(macro.name, macro);
          count += 1;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  register(macro: ToolMacro): void {
    this.macros.set(macro.name, macro);
  }

  get(name: string): ToolMacro | undefined {
    return this.macros.get(name);
  }

  list(): ToolMacro[] {
    return [...this.macros.values()];
  }

  async persist(macro: ToolMacro): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const safe = macro.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const file = join(this.dir, `${safe}.macro.json`);
    await writeFile(file, JSON.stringify(macro, null, 2), "utf8");
    this.register(macro);
    return file;
  }
}
