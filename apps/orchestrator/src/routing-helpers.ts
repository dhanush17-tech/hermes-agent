import { wantsBrowserGmail } from "@hermes-os/connectors";

/** Third-party accounts — prefer workflows/connectors, not laptop control by default. */
export function messageNeedsLaptopControl(text: string): boolean {
  if (/\b(check|read|summarize|scan|review)\b.*\b(gmail|email|inbox|mail)\b/i.test(text)) {
    return false;
  }
  if (/\b(gmail|email|inbox)\b.*\b(check|read|summarize|unread)\b/i.test(text)) {
    return false;
  }
  return /\b(calendar|schedule|twitter|linkedin|slack|notion|drive|amazon|github|sign in|log in|open\s+https?:\/\/)\b/i.test(
    text,
  );
}

/** Explicit browser/Arc/login requests — allowed before API connectors. */
export function wantsBrowserControlledService(text: string): boolean {
  return (
    wantsBrowserGmail(text) ||
    (messageNeedsLaptopControl(text) &&
      /\b(browser|arc|playwright|chromium|login|log in|logged in|open|show|use)\b/i.test(text))
  );
}

/** Questions about stored user facts — must hit memory, not morning brief or research. */
export function isMemoryRecallQuery(text: string): boolean {
  return /\b(where (?:do i|am i) live|what(?:'s| is) my (?:location|city|address|home)|where am i (?:from|located)|do you know where i live|what do you (?:know|remember) about me)\b/i.test(
    text.trim(),
  );
}

export function isExplicitBrowserRequest(text: string): boolean {
  return wantsBrowserControlledService(text);
}

export { isMorningRoutineQuery } from "./morning-routine-service.js";
