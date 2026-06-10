import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import { smSearch } from "@hermes-os/memory";
import { runPrimaryAgent } from "./agents/primary-agent.js";

export function isMorningRoutineQuery(text: string): boolean {
  const t = text.trim();
  if (/\bmorning\s+routine\b/i.test(t)) return true;
  if (/\b(start|begin)\s+my\s+day\b/i.test(t)) return true;
  if (/\bmorning\s+brief\b/i.test(t)) return true;
  const multiSurface =
    (/\b(inbox|email|mail|gmail)\b/i.test(t) ? 1 : 0) +
    (/\b(calendar|schedule)\b/i.test(t) ? 1 : 0) +
    (/\b(canvas|due|assignment)\b/i.test(t) ? 1 : 0) +
    (/\b(twitter|linkedin|social|x\.com)\b/i.test(t) ? 1 : 0) +
    (/\b(forecast|hindrance|problem|concern)\b/i.test(t) ? 1 : 0);
  return multiSurface >= 3 && /\b(check|read|go|look|scan|review)\b/i.test(t);
}

export async function runMorningRoutine(
  ctx: ToolContext,
  deps: { executor: ToolExecutor; workspaceRoot: string },
): Promise<string> {
  const [openLoops, recentContext, inbox, calendarInvites, weather] = await Promise.all([
    smSearch("pending tasks open loops waiting", {
      limit: 5,
      filterTags: ["type:open_loop"],
      minScore: 0.4,
    }),
    smSearch("current project working on", {
      limit: 3,
      filterTags: ["type:project_context"],
      minScore: 0.5,
    }),
    deps.executor.invoke("gmail.check_inbox", { limit: 10 }, ctx, { summary: "Morning inbox scan" }),
    deps.executor.invoke(
      "gmail.search",
      { query: "from:calendar-notification@google.com newer_than:1d", limit: 10 },
      ctx,
      { summary: "Calendar invites via Gmail" },
    ),
    deps.executor.invoke("web.fetch", { url: "https://wttr.in/?format=3" }, ctx, { summary: "Weather" }),
  ]);

  const briefRequest = `
Generate a morning brief. Today is ${new Date().toLocaleDateString()}.

Open loops from memory:
${openLoops.map((l) => `- ${l.content}`).join("\n") || "None"}

Recent project context:
${recentContext.map((c) => `- ${c.content}`).join("\n") || "None"}

Gmail inbox (top 10): ${JSON.stringify(inbox)}
Calendar invites (via Gmail): ${JSON.stringify(calendarInvites)}
Weather: ${JSON.stringify(weather)}

Format: 3–4 bullet points max. What needs attention today? What's time-sensitive?
`;

  const result = await runPrimaryAgent(briefRequest, ctx, {
    executor: deps.executor,
    workspaceRoot: deps.workspaceRoot,
    memCtx: { systemBlock: "" },
  });

  return result.response ?? result.final ?? "Morning brief unavailable.";
}
