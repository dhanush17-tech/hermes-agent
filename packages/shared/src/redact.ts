const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /API_SERVER_KEY[=:]\s*\S+/gi,
  /HERMES_API_KEY[=:]\s*\S+/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /password[=:]\s*\S+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function redactPayload(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (typeof payload === "string") {
    return redactSecrets(payload);
  }
  if (Array.isArray(payload)) {
    return payload.map(redactPayload);
  }
  if (typeof payload === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("token") ||
        lower.includes("api_key")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactPayload(value);
      }
    }
    return result;
  }
  return payload;
}
