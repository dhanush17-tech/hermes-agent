export type ParsedCredentials = {
  username: string;
  password: string;
};

/** Parse a user reply after a login pause. */
export function parseCredentials(text: string): ParsedCredentials | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 3) return null;

  const userMatch = trimmed.match(
    /(?:username|user|email|login)\s*[:=]\s*([^\n]+?)(?:\s+(?:password|pass)\s*[:=]|$)/i,
  );
  const passMatch = trimmed.match(/(?:password|pass|pwd)\s*[:=]\s*(\S+)/i);

  const user = userMatch?.[1]?.trim();
  const pass = passMatch?.[1]?.trim();
  if (user && pass) {
    return { username: user, password: pass };
  }

  const slash = trimmed.match(/^([^/\n]+)\s*\/\s*(\S+)$/);
  const slashUser = slash?.[1]?.trim();
  const slashPass = slash?.[2]?.trim();
  if (slashUser && slashPass) {
    return { username: slashUser, password: slashPass };
  }

  const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const line0 = lines[0];
  const line1 = lines[1];
  if (line0 && line1 && !line0.includes(":")) {
    return { username: line0, password: line1 };
  }

  return null;
}

export function looksLikeCredentialReply(text: string): boolean {
  if (parseCredentials(text)) return true;
  return /(?:password|pass|pwd)\s*[:=]/i.test(text) && /(?:username|user|email|login)\s*[:=]/i.test(text);
}
