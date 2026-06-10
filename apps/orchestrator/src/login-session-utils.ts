import type { PendingLoginSession } from "./login-session-store.js";

const LOGIN_SESSION_TTL_MS = 30 * 60 * 1000;

export function isLoginSessionExpired(session: PendingLoginSession): boolean {
  const created = Date.parse(session.createdAt);
  if (!Number.isFinite(created)) return true;
  return Date.now() - created > LOGIN_SESSION_TTL_MS;
}

/** True when the user is still steering the paused browser-login flow. */
export function messageRelatesToPendingLogin(text: string, session: PendingLoginSession): boolean {
  const t = text.toLowerCase().trim();
  const service = session.service.toLowerCase();
  if (t.includes(service)) return true;

  try {
    const host = new URL(session.url).hostname.replace(/^www\./, "").toLowerCase();
    if (host && t.includes(host.split(".")[0] ?? host)) return true;
  } catch {
    /* ignore bad url */
  }

  return /\b(login|sign.?in|signin|inbox|gmail|credential|password|arc|browser|oauth|done|continue inbox|go ahead)\b/i.test(
    t,
  );
}
