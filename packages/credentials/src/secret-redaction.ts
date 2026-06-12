const PASSWORD_PATTERNS = [
  /\b(?:password|passwd|pwd)\s*(?:is|:|=)\s*\S+/gi,
  /\b(?:the\s+)?password\s+(?:is\s+)?\S{4,}/gi,
  /\bmy\s+password\s+(?:is\s+)?\S+/gi,
];

const RAW_SECRET_KEYS = new Set([
  "password",
  "passwd",
  "pwd",
  "secret",
  "value",
  "token",
  "apikey",
  "api_key",
]);

export function looksLikePasswordInChat(text: string): boolean {
  return PASSWORD_PATTERNS.some((p) => {
    p.lastIndex = 0;
    return p.test(text);
  });
}

export function redactSecretsFromText(text: string): string {
  let out = text;
  for (const pattern of PASSWORD_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function payloadContainsRawSecret(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.some(payloadContainsRawSecret);
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    if (RAW_SECRET_KEYS.has(normalized) && typeof value === "string" && value.length > 0) {
      return true;
    }
    if (payloadContainsRawSecret(value)) return true;
  }
  return false;
}

export function refusePasswordFromChatReply(): string {
  return "I can't use passwords pasted into normal chat. I can open a secure one-time login prompt instead.";
}
