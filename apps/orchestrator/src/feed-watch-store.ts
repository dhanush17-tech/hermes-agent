import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

export type WatchedFeed = {
  id: string;
  label: string;
  url: string;
  expect: string;
  lastSnapshot: string;
  lastHash: string;
  lastCheckedAt: string;
  createdAt: string;
  enabled: boolean;
};

type FeedWatchFile = {
  feeds: WatchedFeed[];
  updatedAt: string;
};

export function snapshotHash(text: string): string {
  const normalized = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export class FeedWatchStore {
  private readonly path: string;

  constructor(workspaceRoot: string) {
    this.path = resolve(workspaceRoot, "data/feed-watch.json");
  }

  async list(): Promise<WatchedFeed[]> {
    const file = await this.read();
    return file.feeds.filter((f) => f.enabled);
  }

  async listAll(): Promise<WatchedFeed[]> {
    const file = await this.read();
    return file.feeds;
  }

  async get(id: string): Promise<WatchedFeed | null> {
    const file = await this.read();
    return file.feeds.find((f) => f.id === id) ?? null;
  }

  async upsertMany(
    feeds: Array<Omit<WatchedFeed, "lastSnapshot" | "lastHash" | "lastCheckedAt" | "createdAt" | "enabled"> & {
      lastSnapshot?: string;
      enabled?: boolean;
    }>,
  ): Promise<WatchedFeed[]> {
    const file = await this.read();
    const now = new Date().toISOString();
    const out: WatchedFeed[] = [];

    for (const feed of feeds) {
      const existing = file.feeds.find((f) => f.id === feed.id);
      const snap = feed.lastSnapshot ?? existing?.lastSnapshot ?? "";
      const row: WatchedFeed = {
        id: feed.id,
        label: feed.label,
        url: feed.url,
        expect: feed.expect,
        lastSnapshot: snap,
        lastHash: snap ? snapshotHash(snap) : existing?.lastHash ?? "",
        lastCheckedAt: existing?.lastCheckedAt ?? now,
        createdAt: existing?.createdAt ?? now,
        enabled: feed.enabled ?? true,
      };
      if (existing) {
        const idx = file.feeds.indexOf(existing);
        file.feeds[idx] = row;
      } else {
        file.feeds.push(row);
      }
      out.push(row);
    }

    file.updatedAt = now;
    await this.write(file);
    return out;
  }

  async updateSnapshot(id: string, snapshot: string): Promise<WatchedFeed | null> {
    const file = await this.read();
    const feed = file.feeds.find((f) => f.id === id);
    if (!feed) return null;
    feed.lastSnapshot = snapshot;
    feed.lastHash = snapshotHash(snapshot);
    feed.lastCheckedAt = new Date().toISOString();
    file.updatedAt = feed.lastCheckedAt;
    await this.write(file);
    return feed;
  }

  private async read(): Promise<FeedWatchFile> {
    try {
      const raw = await readFile(this.path, "utf8");
      const data = JSON.parse(raw) as FeedWatchFile;
      return { feeds: data.feeds ?? [], updatedAt: data.updatedAt ?? "" };
    } catch {
      return { feeds: [], updatedAt: "" };
    }
  }

  private async write(file: FeedWatchFile): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(file, null, 2), "utf8");
  }
}
