import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Connector, ConnectorScanResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class ScreenConnector implements Connector {
  readonly name = "screen";

  constructor(private readonly captureDir: string) {}

  async scan(): Promise<ConnectorScanResult> {
    if (process.platform !== "darwin") {
      return { connector: this.name, items: [], error: "Screen capture is macOS-only" };
    }

    try {
      await mkdir(this.captureDir, { recursive: true });
      const file = join(this.captureDir, `screen-${Date.now()}.png`);
      await execFileAsync("screencapture", ["-x", file], { timeout: 15_000 });

      return {
        connector: this.name,
        items: [
          {
            sourceType: "screen",
            externalId: `screen:${file}`,
            title: "Screen capture",
            content: file,
            metadata: JSON.stringify({ path: file }),
          },
        ],
      };
    } catch (err) {
      return {
        connector: this.name,
        items: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createScreenConnector(workspaceRoot: string): ScreenConnector {
  return new ScreenConnector(join(workspaceRoot, "data", "screen-captures"));
}
