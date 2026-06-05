import type { GmailConnectorPort, GmailOpenLoop } from "./types.js";

const OPEN_LOOP_PATTERN =
  /\b(reply|follow.?up|confirm|waiting|rsvp|logistics|deadline|action required)\b/i;

export async function extractGmailOpenLoops(
  connector: GmailConnectorPort,
  since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
): Promise<GmailOpenLoop[]> {
  const loops = await connector.extractOpenLoops(since);
  return loops.filter((l) => OPEN_LOOP_PATTERN.test(l.description));
}

export function scoreOpenLoopPriority(loop: GmailOpenLoop): number {
  let score = 50;
  if (/deadline|urgent|asap/i.test(loop.description)) score += 25;
  if (/waiting|no reply|follow.?up/i.test(loop.description)) score += 15;
  return Math.min(100, score);
}
