import type { IndexedFile } from "./file-indexer.js";

export function searchIndexedFiles(
  files: IndexedFile[],
  query: string,
  limit = 10,
): IndexedFile[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return files.slice(0, limit);

  const scored = files
    .map((file) => {
      const blob = `${file.path} ${file.extractedText} ${file.summary}`.toLowerCase();
      const score = terms.reduce((acc, term) => acc + (blob.includes(term) ? 1 : 0), 0);
      return { file, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r) => r.file);
}
