type FailureRecord = { reason: string; count: number; at: number };

const failures = new Map<string, FailureRecord>();

export type StuckCheck = {
  stuck: boolean;
  attempts: number;
  healAction: string;
};

export function checkBrowserStuck(key: string, reason: string): StuckCheck {
  const prev = failures.get(key);
  const attempts = prev?.reason === reason ? prev.count + 1 : 1;
  failures.set(key, { reason, count: attempts, at: Date.now() });

  if (attempts < 2) {
    return { stuck: false, attempts, healAction: "" };
  }

  return {
    stuck: true,
    attempts,
    healAction: selfHealAction(key, reason),
  };
}

export function peekBrowserStuck(key: string, minAttempts = 2): StuckCheck | null {
  const prev = failures.get(key);
  if (!prev || prev.count < minAttempts) return null;
  return {
    stuck: true,
    attempts: prev.count,
    healAction: selfHealAction(key, prev.reason),
  };
}

export function clearBrowserStuck(key: string): void {
  failures.delete(key);
}

export function resetBrowserStuck(): void {
  failures.clear();
}

function selfHealAction(key: string, reason: string): string {
  if (key.startsWith("gmail:")) {
    const email = key.slice("gmail:".length);
    if (reason === "gmail_login_required" || reason === "browser_login_required") {
      return `Stop reopening Gmail — sign into **${email}** in Arc once, then reply **continue routine**.`;
    }
    if (reason.startsWith("wrong_page:")) {
      return "Wrong Arc tab was active — focus your Gmail inbox tab manually, then reply **continue routine**.";
    }
    if (reason === "arc_js_disabled") {
      return 'Enable Arc → View → Developer → **Allow JavaScript from Apple Events**, then reply **continue routine**.';
    }
    return `Gmail read failed for ${email} (${reason}) — fix Arc tab manually, then **continue routine**.`;
  }
  return `Browser stuck on ${reason} — fix the tab manually, then retry.`;
}
