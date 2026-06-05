import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type IndexedFile = {
  path: string;
  modifiedAt: string;
  hash: string;
  extractedText: string;
  summary: string;
  sensitivity: "normal" | "private";
};

const TEXT_EXTENSIONS = /\.(md|txt|json|yaml|yml|ts|tsx|js|jsx|py|rs|go)$/i;

export class FileIndexer {
  private readonly index = new Map<string, IndexedFile>();

  constructor(
    private readonly workspaceRoot: string,
    private readonly scanDirs = ["docs", "data"],
  ) {}

  scan(maxFiles = 50, maxAgeDays = 30): IndexedFile[] {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const results: IndexedFile[] = [];

    for (const dir of this.scanDirs) {
      this.collect(join(this.workspaceRoot, dir), cutoff, results, maxFiles);
    }

    for (const file of results) {
      this.index.set(file.path, file);
    }
    return results;
  }

  get(path: string): IndexedFile | undefined {
    return this.index.get(path);
  }

  all(): IndexedFile[] {
    return [...this.index.values()];
  }

  private collect(base: string, cutoff: number, results: IndexedFile[], maxFiles: number, depth = 0): void {
    if (depth > 4 || results.length >= maxFiles) return;
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      return;
    }

    for (const name of entries) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(base, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        this.collect(full, cutoff, results, maxFiles, depth + 1);
        continue;
      }
      if (!TEXT_EXTENSIONS.test(name) && !/\.pdf$/i.test(name)) continue;
      if (st.mtimeMs < cutoff) continue;

      const rel = relative(this.workspaceRoot, full);
      const extractedText = this.extractText(full, name);
      results.push({
        path: rel,
        modifiedAt: new Date(st.mtimeMs).toISOString(),
        hash: createHash("sha256").update(extractedText).digest("hex").slice(0, 16),
        extractedText,
        summary: extractedText.slice(0, 200).replace(/\s+/g, " "),
        sensitivity: /secret|credential|\.env/i.test(rel) ? "private" : "normal",
      });
    }
  }

  private extractText(full: string, name: string): string {
    if (/\.pdf$/i.test(name)) {
      return `[PDF indexed: ${name}]`;
    }
    try {
      return readFileSync(full, "utf8").slice(0, 8000);
    } catch {
      return "";
    }
  }
}
