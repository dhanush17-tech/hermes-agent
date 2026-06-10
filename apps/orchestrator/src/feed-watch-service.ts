import { gmailInboxUrl } from "@hermes-os/browser-control";
import type { IdentityContext } from "@hermes-os/memory";
import { llmCall, MODEL_ROUTING } from "@hermes-os/llm-client";
import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { NotificationCenter } from "@hermes-os/notification-center";
import { FeedWatchStore, snapshotHash, type WatchedFeed } from "./feed-watch-store.js";

export type FeedWatchDeps = {
  workspaceRoot: string;
  executor: ToolExecutor;
  audit: AuditLogger;
  notificationCenter?: NotificationCenter | null;
};

export type FeedChangeAnalysis = {
  actionNeeded: boolean;
  concern: boolean;
  score: number;
  title: string;
  body: string;
  forecast?: string;
};

export function buildFeedsFromIdentity(identity: IdentityContext): Array<{
  id: string;
  label: string;
  url: string;
  expect: string;
}> {
  const feeds: Array<{ id: string; label: string; url: string; expect: string }> = [];

  for (const email of identity.emails) {
    feeds.push({
      id: `gmail:${email}`,
      label: `Gmail — ${email}`,
      url: gmailInboxUrl(email),
      expect: "gmail",
    });
  }

  feeds.push({
    id: "calendar:today",
    label: "Google Calendar (today)",
    url: "https://calendar.google.com",
    expect: "calendar",
  });

  feeds.push({
    id: "canvas:due",
    label: "Canvas (due in 48h)",
    url: identity.canvasUrl,
    expect: "canvas",
  });

  for (const { label, handle } of identity.twitterHandles) {
    feeds.push({
      id: `twitter:${handle}`,
      label: `X / Twitter (${label}: @${handle})`,
      url: `https://x.com/${handle}`,
      expect: "twitter",
    });
  }

  feeds.push({
    id: "linkedin:feed",
    label: "LinkedIn feed",
    url: identity.linkedinUrl ?? "https://www.linkedin.com/feed/",
    expect: "linkedin",
  });

  return feeds;
}

export async function registerMorningRoutineFeeds(
  store: FeedWatchStore,
  identity: IdentityContext,
  snapshots?: Map<string, string>,
): Promise<WatchedFeed[]> {
  const defs = buildFeedsFromIdentity(identity);
  return store.upsertMany(
    defs.map((d) => ({
      ...d,
      lastSnapshot: snapshots?.get(d.id) ?? undefined,
    })),
  );
}

export function diffSnapshots(before: string, after: string): string[] {
  const oldLines = new Set(
    before
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length >= 8),
  );
  const added: string[] = [];
  for (const line of after.split("\n")) {
    const t = line.trim();
    if (t.length < 8) continue;
    if (!oldLines.has(t)) added.push(t);
  }
  return [...new Set(added)].slice(0, 40);
}

const URGENT_RE =
  /\b(urgent|asap|action required|reply|rsvp|deadline|due today|overdue|security|verify|suspicious|interview|offer|invoice|payment|confirm|cancelled|rescheduled)\b/i;

export function analyzeFeedChangeHeuristic(
  feed: WatchedFeed,
  addedLines: string[],
): FeedChangeAnalysis | null {
  if (!addedLines.length) return null;

  const joined = addedLines.join("\n");
  const urgent = URGENT_RE.test(joined);
  const actionNeeded = urgent || /\b(reply|rsvp|submit|review|respond|sign|accept|decline)\b/i.test(joined);
  const concern =
    urgent ||
    /\b(security|verify|suspicious|failed|declined|overdue|late fee|account locked)\b/i.test(joined);

  let score = 55 + Math.min(addedLines.length * 3, 25);
  if (actionNeeded) score += 15;
  if (concern) score += 20;
  if (feed.expect === "gmail" && /\b(unread|new message|from:)\b/i.test(joined)) score += 10;

  const preview = addedLines.slice(0, 6).join("\n");
  const forecast = forecastFromFeed(feed, addedLines);

  return {
    actionNeeded,
    concern,
    score: Math.min(score, 98),
    title: `${feed.label} — update detected`,
    body: [preview, forecast ? `\n**Likely next:** ${forecast}` : ""].filter(Boolean).join("\n"),
    forecast,
  };
}

function forecastFromFeed(feed: WatchedFeed, added: string[]): string | undefined {
  const text = added.join(" ").toLowerCase();
  if (feed.expect === "gmail") {
    if (/\b(interview|recruiter|offer)\b/.test(text)) return "You may need to reply or block calendar time within 24–48h.";
    if (/\b(invoice|payment|due)\b/.test(text)) return "Payment or approval may be due soon — check amount and deadline.";
    if (/\b(security|verify|suspicious)\b/.test(text)) return "Treat as time-sensitive; verify sender before clicking links.";
  }
  if (feed.expect === "calendar" && /\b(meeting|standup|1:1|interview)\b/.test(text)) {
    return "A new or moved event may conflict with your day — confirm prep and travel time.";
  }
  if (feed.expect === "canvas" && /\b(due|assignment|quiz|exam)\b/.test(text)) {
    return "Assignment load may spike — plan work blocks before the due window closes.";
  }
  if ((feed.expect === "twitter" || feed.expect === "linkedin") && /\b(hiring|launch|funding|breaking)\b/.test(text)) {
    return "Social signal may need a response or bookmark for follow-up research.";
  }
  return undefined;
}

function isLlmAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export async function analyzeFeedChangeWithLlm(
  feed: WatchedFeed,
  addedLines: string[],
): Promise<FeedChangeAnalysis | null> {
  const heuristic = analyzeFeedChangeHeuristic(feed, addedLines);
  if (!heuristic) return null;

  const system =
    "You triage personal feed changes. Be concise. Predict what the user should do next if anything. No markdown in JSON strings.";

  let raw: string;
  try {
    const res = await llmCall({
      model: MODEL_ROUTING.primary_reasoning,
      max_tokens: 350,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Feed: ${feed.label} (${feed.expect})`,
            "New lines since last check:",
            addedLines.slice(0, 20).join("\n"),
            "Reply ONLY JSON:",
            '{"actionNeeded":true,"concern":false,"score":0-100,"summary":"2-3 sentences","forecast":"one sentence prediction"}',
          ].join("\n"),
        },
      ],
    });
    raw = res.content ?? "";
  } catch {
    return heuristic;
  }

  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return heuristic;
    const data = JSON.parse(raw.slice(start, end + 1)) as {
      actionNeeded?: boolean;
      concern?: boolean;
      score?: number;
      summary?: string;
      forecast?: string;
    };
    return {
      actionNeeded: Boolean(data.actionNeeded ?? heuristic.actionNeeded),
      concern: Boolean(data.concern ?? heuristic.concern),
      score: Math.min(100, Math.max(50, Number(data.score) || heuristic.score)),
      title: `${feed.label} — ${data.actionNeeded || data.concern ? "needs attention" : "update"}`,
      body: [data.summary ?? heuristic.body, data.forecast ? `\n**Forecast:** ${data.forecast}` : ""]
        .filter(Boolean)
        .join("\n"),
      forecast: data.forecast ?? heuristic.forecast,
    };
  } catch {
    return heuristic;
  }
}

async function readFeedSnapshot(
  executor: ToolExecutor,
  feed: WatchedFeed,
  ctx: ToolContext,
): Promise<{ ok: boolean; text: string; reason?: string }> {
  try {
    const result = await executor.invoke(
      "browser.arc_read",
      { url: feed.url, expect: feed.expect, reuseOnly: true },
      ctx,
      { summary: `Feed watch: ${feed.label}` },
    );

    if (result.status === "success") {
      return { ok: true, text: String((result.data as { text?: string }).text ?? "") };
    }
    if (result.status === "pending_approval") {
      return { ok: false, text: "", reason: result.message };
    }
    return { ok: false, text: "", reason: result.reason ?? "read failed" };
  } catch (err) {
    return {
      ok: false,
      text: "",
      reason: err instanceof Error ? err.message : "arc_read threw",
    };
  }
}

export async function pollFeedWatch(
  deps: FeedWatchDeps,
  ctx: ToolContext,
  options?: { feedId?: string; forceNotify?: boolean },
): Promise<string | null> {
  const store = new FeedWatchStore(deps.workspaceRoot);
  let feeds: WatchedFeed[] = await store.list();
  if (options?.feedId) {
    const one = await store.get(options.feedId);
    feeds = one ? [one] : [];
  }

  if (!feeds.length) return null;

  const alerts: string[] = [];
  let checked = 0;
  let changed = 0;

  for (const feed of feeds) {
    const read = await readFeedSnapshot(deps.executor, feed, ctx);
    checked += 1;

    if (!read.ok) {
      await deps.audit.log({
        eventType: "agent_finished",
        actor: "system",
        payload: { kind: "feed_watch_error", feedId: feed.id, reason: read.reason },
      });
      continue;
    }

    const snap = read.text.slice(0, 8000);
    const hash = snapshotHash(snap);

    if (!feed.lastHash) {
      await store.updateSnapshot(feed.id, snap);
      continue;
    }

    if (hash === feed.lastHash) continue;

    changed += 1;
    const added = diffSnapshots(feed.lastSnapshot, snap);
    await store.updateSnapshot(feed.id, snap);

    if (!added.length && !options?.forceNotify) continue;

    const analysis =
      isLlmAvailable() && (added.length >= 2 || URGENT_RE.test(added.join(" "))) ?
        await analyzeFeedChangeWithLlm(feed, added.length ? added : [snap.slice(0, 400)])
      : analyzeFeedChangeHeuristic(feed, added.length ? added : [snap.slice(0, 400)]);

    if (!analysis) continue;
    if (!analysis.actionNeeded && !analysis.concern && !options?.forceNotify) continue;

    const dedupeKey = `feed:${feed.id}:${hash}`;
    if (deps.notificationCenter) {
      await deps.notificationCenter.dispatch({
        type: analysis.concern ? "risk" : "reminder",
        title: analysis.title,
        body: analysis.body.slice(0, 1500),
        score: analysis.score,
        dedupeKey,
        priority: analysis.concern ? "high" : analysis.actionNeeded ? "medium" : "low",
      });
    }

    alerts.push(`**${analysis.title}** (score ${analysis.score})\n${analysis.body.slice(0, 500)}`);

    await deps.audit.log({
      eventType: "proactive_notification_sent",
      actor: "system",
      payload: {
        kind: "feed_watch_change",
        feedId: feed.id,
        score: analysis.score,
        actionNeeded: analysis.actionNeeded,
        concern: analysis.concern,
        addedLines: added.length,
      },
    });
  }

  if (!alerts.length) {
    if (changed === 0 && checked > 0) return null;
    return changed ? `Checked ${checked} feeds — ${changed} changed but nothing needed action.` : null;
  }

  return [
    `Feed watch: ${alerts.length} alert(s) from ${checked} tab(s).`,
    "",
    ...alerts,
    "",
    "_Tabs stay open in Arc — I'll keep watching on the poll interval._",
  ].join("\n");
}
