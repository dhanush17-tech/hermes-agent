import type { ToolContext } from "@hermes-os/shared";
import type { ToolExecutor } from "@hermes-os/tool-executor";
import type { InjectedContext } from "@hermes-os/memory";
import { smAdd } from "@hermes-os/memory";

export function isWeatherQuery(text: string): boolean {
  return /\b(how(?:'s| is) the weather|what(?:'s| is) the weather|weather (?:like|today|now|here|there)|temperature (?:outside|here)|forecast)\b/i.test(
    text,
  );
}

export function isLocationCorrection(text: string): boolean {
  return /\b(i(?:'m| am) (?:in|at)|did you not know|actually (?:in|at)|right now|not in )\b/i.test(text);
}

export function recentWeatherQueryInHistory(
  history: Array<{ role: string; content: string }> | undefined,
): boolean {
  if (!history?.length) return false;
  return history
    .slice(-6)
    .some((turn) => turn.role === "user" && isWeatherQuery(turn.content));
}

export function shouldHandleWeatherTurn(
  text: string,
  history: Array<{ role: string; content: string }> | undefined,
): boolean {
  if (isWeatherQuery(text)) return true;
  if (isLocationCorrection(text) && recentWeatherQueryInHistory(history)) return true;
  return false;
}

export function resolveWeatherLocation(
  text: string,
  memCtx: InjectedContext,
  history: Array<{ role: string; content: string }> | undefined,
): string | null {
  const fromMessage = extractLocationPhrase(text);
  if (fromMessage) return sanitizeLocation(fromMessage);

  const memoryBlob = [memCtx.systemBlock, ...memCtx.rawMemories.map((m) => m.content)].join("\n");
  const fromMemory = extractLocationPhrase(memoryBlob);
  if (fromMemory) return sanitizeLocation(fromMemory);

  if (history?.length) {
    for (const turn of [...history].reverse()) {
      const fromTurn = extractLocationPhrase(turn.content);
      if (fromTurn) return fromTurn;
    }
  }

  return null;
}

function extractLocationPhrase(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const street = t.match(
    /\b(\d+\s+[A-Za-z][\w\s.-]*(?:Way|Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln))\b/i,
  );
  if (street) {
    const phrase = street[1]!.trim();
    if (/\bStanford\b/i.test(t)) return `${phrase}, Stanford, CA`;
    if (/\bScottsdale\b/i.test(t)) return `${phrase}, Scottsdale, AZ`;
    return phrase;
  }

  const inCity = t.match(
    /\b(?:i(?:'m| am)|in|at|near)\s+([A-Za-z][A-Za-z\s]{2,40}?)(?:\s+right now|\s+now|\s+today|[?.!,]|$)/i,
  );
  if (inCity) {
    const city = inCity[1]!.trim();
    if (!/^(the|a|an|here|there)$/i.test(city)) return city;
  }

  if (/\bStanford\b/i.test(t)) return "Stanford, CA";
  if (/\bScottsdale\b/i.test(t)) return "Scottsdale, AZ";

  const memLocation = t.match(/\b(?:current )?location[:\s]+([^\n.]+)/i);
  if (memLocation) return sanitizeLocation(memLocation[1]!.trim());

  const addressInText = t.match(/\b(\d+\s+Arguello Way)\b/i);
  if (addressInText) return `${addressInText[1]!.trim()}, Stanford, CA`;

  return null;
}

function sanitizeLocation(raw: string): string {
  const cleaned = raw
    .replace(/[)\]}>]+/g, "")
    .replace(/\bnot\s+[A-Za-z][\w\s]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const streetOnly = cleaned.match(
    /\b(\d+\s+[A-Za-z][\w\s.-]*(?:Way|Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln))\b/i,
  );
  if (streetOnly) {
    if (/\bStanford\b/i.test(cleaned)) return `${streetOnly[1]!.trim()}, Stanford, CA`;
    if (/\bScottsdale\b/i.test(cleaned)) return `${streetOnly[1]!.trim()}, Scottsdale, AZ`;
    return streetOnly[1]!.trim();
  }
  return cleaned.split(/[;|]/)[0]!.trim();
}

export async function handleWeatherTurn(
  text: string,
  ctx: ToolContext,
  executor: ToolExecutor,
  memCtx: InjectedContext,
): Promise<string> {
  const location = resolveWeatherLocation(text, memCtx, ctx.conversationHistory);
  if (!location) {
    return "Which city or address should I check the weather for?";
  }

  if (isLocationCorrection(text)) {
    try {
      await smAdd(`Current location: ${location}`, {
        memory_type: "durable_fact",
        scope: "location",
        source: "user_correction",
        confidence: "0.95",
      });
    } catch {
      /* memory optional */
    }
  }

  const weatherLine = await fetchWeatherLine(executor, location, ctx);
  if (!weatherLine) {
    return `I couldn't fetch live weather for ${location}. Try again in a moment.`;
  }

  if (isLocationCorrection(text) && !isWeatherQuery(text)) {
    return `Got it — you're in ${location}. ${weatherLine}`;
  }

  return weatherLine;
}

async function fetchWeatherLine(
  executor: ToolExecutor,
  location: string,
  ctx: ToolContext,
): Promise<string | null> {
  const slug = location.trim().replace(/\s+/g, "+");
  const result = await executor.invoke(
    "web.fetch",
    { url: `https://wttr.in/${encodeURIComponent(slug)}?format=3` },
    ctx,
    { summary: `Weather for ${location}` },
  );

  if (result.status !== "success" || !result.data) return null;

  const data = result.data as { content?: string; status?: number };
  const content = data.content?.trim();
  if (!content || data.status && data.status >= 400) return null;

  const line = content.split("\n").map((l) => l.trim()).find(Boolean) ?? content;
  if (/unknown location|not found/i.test(line)) return null;

  return formatWeatherReply(location, line);
}

function formatWeatherReply(location: string, wttrLine: string): string {
  if (/:/.test(wttrLine)) {
    return `It's ${wttrLine.replace(/^[^:]+:\s*/, "").trim()} in ${location}.`;
  }
  return `Weather in ${location}: ${wttrLine}`;
}
