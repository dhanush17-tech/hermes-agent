/**
 * Strip model chain-of-thought / draft scaffolding from user-facing replies.
 * GLM and similar models often emit numbered analysis before the actual message.
 */
export function looksLikeLeakedReasoning(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d+\.\s+\*\*(Analyze|Understand|Verify|Consult|Identify|Determine|Select|Formulate)/im.test(t)) {
    return true;
  }
  const steps = t.match(/^\d+\.\s+\*\*/gm);
  if (steps && steps.length >= 2) return true;
  if (/^\d+\.\s+\*\*[^*]+:\*\*/m.test(t) && steps && steps.length >= 1) {
    return true;
  }
  return false;
}

export function stripModelReasoning(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const draftMatches = [
    ...trimmed.matchAll(/\*Draft\s*\d+:\*?\s*["'""]?(.+?)["'""]?(?=\n|$|\*Draft)/gis),
  ];
  if (draftMatches.length) {
    const last = draftMatches[draftMatches.length - 1]![1]!.trim();
    if (last.length >= 4) return last.replace(/^["'""]|["'""]$/g, "").trim();
  }

  const formulateSection = trimmed.match(
    /\*\*Formulate(?: the response)?:?\*\*([\s\S]*)/i,
  );
  if (formulateSection) {
    const tail = formulateSection[1]!;
    const quoted = tail.match(/["'""]([^"'""\n]{8,280})["'""]/g);
    if (quoted?.length) {
      const last = quoted[quoted.length - 1]!;
      return last.replace(/^["'""]|["'""]$/g, "").trim();
    }
  }

  if (looksLikeLeakedReasoning(trimmed)) {
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!;
      if (line.length > 280) continue;
      if (/^\d+\.\s/.test(line)) continue;
      if (/^\*\*/.test(line)) continue;
      if (/^[-*•]\s/.test(line)) continue;
      if (/^\(.*durable_facts.*\)/i.test(line)) continue;
      if (/^(Analyze|Understand|Verify|Identify|Consult|Formulate|Determine|Select|Conflict|Context|Interpretation|Memory says)/i.test(line)) {
        continue;
      }
      const cleaned = line.replace(/^["'""]|["'""]$/g, "").trim();
      if (cleaned.length >= 8 && !looksLikeLeakedReasoning(cleaned)) return cleaned;
    }
    return "";
  }

  return trimmed;
}

export function sanitizeAssistantReply(text: string): string {
  return stripModelReasoning(text).trim();
}

export const MESSAGING_RETRY_SYSTEM =
  "Your previous reply was rejected — it exposed internal reasoning steps. " +
  "Output ONLY the final message the user should read (1–3 sentences). " +
  "No numbered lists, no ** headers, no analysis, no memory verification.";

export function messagingModelId(): string {
  return (
    process.env.HERMES_MESSAGING_MODEL?.trim() ||
    "@cf/meta/llama-3.2-3b-instruct"
  );
}
