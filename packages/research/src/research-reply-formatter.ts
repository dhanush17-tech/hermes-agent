const ADVISORY_PREAMBLE =
  /^if i were advising you personally\b|^given you(?:'re| are)\b/i;

function extractAnswerSection(text: string): string {
  const t = text.trim();
  const md = t.match(/##\s*Answer\s*\n+([\s\S]*?)(?=\n##\s|\n#\s[^#]|$)/i);
  if (md?.[1]?.trim()) return md[1].trim();

  const bold = t.match(/\*\*Answer\*\*\s*\n+([\s\S]*?)(?=\n\*\*|\n##\s|$)/i);
  if (bold?.[1]?.trim()) return bold[1].trim();

  return t.replace(/^#\s*Research Memo[^\n]*\n*/i, "").trim();
}

function hasPriceSignal(text: string): boolean {
  return /\$\d[\d,]*(?:\.\d{2})?|\bUSD\s?\d/i.test(text);
}

function stripAdvisoryLines(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((line) => {
      if (ADVISORY_PREAMBLE.test(line)) return false;
      if (line.endsWith(":") && line.length < 140 && !hasPriceSignal(line)) return false;
      return true;
    });
  return lines.join("\n").trim();
}

function priceSummaryFromText(text: string): string | null {
  const matches = text.match(/(?:\$|USD\s?)\d[\d,]*(?:\.\d{2})?/g);
  if (!matches?.length) return null;
  const unique = [...new Set(matches.map((m) => m.replace(/\s+/g, "")))];
  return `Current pricing from my search: ${unique.slice(0, 5).join(", ")}.`;
}

/** Turn research-engine memo output into a short chat-ready reply. */
export function formatResearchReplyForChat(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  let body = extractAnswerSection(trimmed);
  body = stripAdvisoryLines(body);

  if (body && hasPriceSignal(body)) {
    return body.slice(0, 1200);
  }

  if (body && !ADVISORY_PREAMBLE.test(body) && body.length >= 40) {
    return body.slice(0, 1200);
  }

  const fromRaw = priceSummaryFromText(trimmed);
  if (fromRaw) return fromRaw;

  if (body && !body.endsWith(":")) return body.slice(0, 1200);

  return trimmed.slice(0, 1200);
}

export function isAdvisoryOnlyReply(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (hasPriceSignal(t)) return false;
  if (ADVISORY_PREAMBLE.test(t)) return true;
  if (t.endsWith(":") && t.length < 160) return true;
  return false;
}
