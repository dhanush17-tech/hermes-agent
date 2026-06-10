import { describe, expect, it } from "vitest";
import { diffSnapshots, analyzeFeedChangeHeuristic } from "./feed-watch-service.js";
import type { WatchedFeed } from "./feed-watch-store.js";

describe("feed-watch-service", () => {
  it("detects added lines between snapshots", () => {
    const before = "Inbox\nFrom: Alice — Project update\nFrom: Bob — Lunch";
    const after = `${before}\nFrom: Carol — URGENT: reply needed by 5pm`;
    const added = diffSnapshots(before, after);
    expect(added.some((l) => /Carol/.test(l))).toBe(true);
  });

  it("flags urgent gmail changes", () => {
    const feed: WatchedFeed = {
      id: "gmail:test@example.com",
      label: "Gmail — test@example.com",
      url: "https://mail.google.com",
      expect: "gmail",
      lastSnapshot: "",
      lastHash: "",
      lastCheckedAt: "",
      createdAt: "",
      enabled: true,
    };
    const analysis = analyzeFeedChangeHeuristic(feed, ["From: HR — Interview tomorrow 9am, please confirm"]);
    expect(analysis?.actionNeeded).toBe(true);
    expect(analysis?.score).toBeGreaterThan(70);
  });
});
