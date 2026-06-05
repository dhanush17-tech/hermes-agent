export * from "./file-indexer.js";
export * from "./file-search.js";
export * from "./file-watch.js";
export * from "./document-summarizer.js";

import type { Connector, ConnectorScanResult } from "../types.js";
import { FileIndexer } from "./file-indexer.js";

export function createFileIndexerConnector(workspaceRoot: string): Connector {
  const indexer = new FileIndexer(workspaceRoot);
  return {
    name: "local_files",
    async scan(): Promise<ConnectorScanResult> {
      const files = indexer.scan();
      const items: ConnectorScanResult["items"] = files.map((f) => ({
        sourceType: "local_files",
        externalId: `file:${f.path}`,
        title: f.path,
        content: f.summary,
        metadata: JSON.stringify({
          path: f.path,
          hash: f.hash,
          modifiedAt: f.modifiedAt,
          method: "local_db",
          sensitivity: f.sensitivity,
        }),
      }));
      return { connector: "local_files", items };
    },
  };
}
