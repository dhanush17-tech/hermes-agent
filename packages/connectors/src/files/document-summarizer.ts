import type { IndexedFile } from "./file-indexer.js";

export function summarizeDocument(file: IndexedFile, maxLength = 300): string {
  const text = file.extractedText.replace(/\s+/g, " ").trim();
  if (!text) return `${file.path} (no extractable text)`;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

export function summarizeDocuments(files: IndexedFile[]): string {
  if (files.length === 0) return "No documents indexed.";
  return files
    .slice(0, 5)
    .map((f) => `• ${f.path}: ${summarizeDocument(f, 120)}`)
    .join("\n");
}
