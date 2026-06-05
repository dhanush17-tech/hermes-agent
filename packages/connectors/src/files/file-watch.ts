import { watch } from "node:fs";
import { join } from "node:path";
import type { FileIndexer } from "./file-indexer.js";

export type FileWatchHandle = {
  stop: () => void;
};

export function watchWorkspaceFiles(
  workspaceRoot: string,
  indexer: FileIndexer,
  onChange?: (path: string) => void,
): FileWatchHandle {
  const dirs = ["docs", "data"].map((d) => join(workspaceRoot, d));
  const watchers = dirs.map((dir) => {
    try {
      return watch(dir, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        indexer.scan();
        onChange?.(filename.toString());
      });
    } catch {
      return null;
    }
  });

  return {
    stop: () => {
      for (const w of watchers) w?.close();
    },
  };
}
