import type { ContextGraphService } from "@hermes-os/context-graph";

const CONTEXT_QUERY_PATTERNS = [
  /\bwho\s+is\s+waiting\s+on\s+me\b/i,
  /\bwho'?s\s+waiting\s+on\s+me\b/i,
  /\bwhat\s+am\s+i\s+missing\b/i,
  /\bopen\s+loops?\b/i,
  /\bwho\s+needs\s+(a\s+)?reply\b/i,
  /\bwaiting\s+for\s+(my\s+)?reply\b/i,
  /\bunanswered\s+(emails?|messages?)\b/i,
];

export function isContextGraphQuery(text: string): boolean {
  const t = text.trim();
  return CONTEXT_QUERY_PATTERNS.some((p) => p.test(t));
}

export class ContextGraphAgent {
  constructor(private readonly graph: ContextGraphService) {}

  async answer(text: string): Promise<string> {
    const t = text.trim().toLowerCase();

    if (
      /\bwho\s+is\s+waiting\b/.test(t) ||
      /\bwaiting\s+on\s+me\b/.test(t) ||
      /\bwho\s+needs\s+reply\b/.test(t)
    ) {
      const entries = await this.graph.getWhoIsWaitingOnYou();
      return this.graph.formatWaitingOnYouReport(entries);
    }

    if (/\bwhat\s+am\s+i\s+missing\b/.test(t)) {
      const ctx = await this.graph.getDailyContext();
      const lines = [
        `Context snapshot — ${ctx.date}`,
        "",
        `Open loops: ${ctx.openLoops.length}`,
        `Commitments: ${ctx.commitments.length}`,
        `Active risks: ${ctx.risks.length}`,
        `People waiting on you: ${ctx.waitingOnYou.length}`,
        "",
      ];
      if (ctx.waitingOnYou.length > 0) {
        lines.push(this.graph.formatWaitingOnYouReport(ctx.waitingOnYou));
      } else {
        lines.push("Top open loops:");
        for (const l of ctx.openLoops.slice(0, 5)) {
          lines.push(`- ${l.description.slice(0, 100)}`);
        }
      }
      return lines.join("\n");
    }

    if (/\bopen\s+loops?\b/.test(t)) {
      const loops = (await this.graph.findOpenLoops({ status: "open" })).slice(0, 15);
      if (loops.length === 0) return "No open loops in the context graph.";
      return ["Open loops:", ...loops.map((l, i) => `${i + 1}. ${l.description.slice(0, 120)}`)].join(
        "\n",
      );
    }

    const ctx = await this.graph.getDailyContext();
    return [
      `Daily context — ${ctx.date}`,
      `People: ${ctx.people.length} | Projects: ${ctx.projects.length}`,
      `Open loops: ${ctx.openLoops.length} | Waiting on you: ${ctx.waitingOnYou.length}`,
    ].join("\n");
  }
}
