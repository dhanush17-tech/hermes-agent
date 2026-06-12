import type { MemoryService } from "./memory-service.js";

export type IdentityContext = {
  emails: string[];
  twitterHandles: Array<{ label: string; handle: string }>;
  canvasUrl: string;
  linkedinUrl?: string;
};

const DEFAULT_EMAILS = [
  "people@devlabs.club",
  "dhanush.kalaiselvan@gmail.com",
  "dkalaise@asu.edu",
];

const DEFAULT_TWITTER: Array<{ label: string; handle: string }> = [
  { label: "personal", handle: "geeky_dan" },
  { label: "devlabs", handle: "Devlabs_club" },
];

const DEFAULT_CANVAS_URL = "https://canvas.asu.edu";

const INVALID_HANDLES = new Set([
  "today",
  "citing",
  "narrative",
  "pected",
  "ecution",
  "t",
  "gmail",
  "inbox",
  "devlabs",
  "personal",
  "twitter",
  "delete",
]);

export function isValidTwitterHandle(handle: string): boolean {
  const h = handle.replace(/^@/, "").trim();
  if (h.length < 3 || h.length > 30) return false;
  if (!/^[a-zA-Z0-9_]+$/.test(h)) return false;
  if (INVALID_HANDLES.has(h.toLowerCase())) return false;
  return true;
}

export async function resolveIdentityContext(
  memory: MemoryService,
  userText: string,
): Promise<IdentityContext> {
  const emailsFromText = [...userText.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((m) => m[0]!);
  const emails = [...new Set([...emailsFromText, ...DEFAULT_EMAILS])];

  const rows = await memory.search("twitter x handle geeky_dan Devlabs_club canvas linkedin", 20);
  const twitterHandles = mergeTwitterHandles(DEFAULT_TWITTER, extractTwitterHandles(rows.map((r) => r.content)));

  let canvasUrl = DEFAULT_CANVAS_URL;
  let linkedinUrl: string | undefined;

  for (const content of rows.map((r) => r.content)) {
    const canvas = content.match(/canvas\s*(?:url)?\s*:?\s*(https?:\/\/[^\s]+)/i);
    if (canvas?.[1]) canvasUrl = canvas[1].replace(/[.,)]+$/, "");

    const linkedin = content.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
    if (linkedin?.[0]) linkedinUrl = linkedin[0];
  }

  return { emails, twitterHandles, canvasUrl, linkedinUrl };
}

function mergeTwitterHandles(
  defaults: Array<{ label: string; handle: string }>,
  fromMemory: Array<{ label: string; handle: string }>,
): Array<{ label: string; handle: string }> {
  const byLabel = new Map<string, string>();
  for (const d of defaults) byLabel.set(d.label, d.handle);
  for (const m of fromMemory) {
    if (isValidTwitterHandle(m.handle)) byLabel.set(m.label, m.handle.replace(/^@/, ""));
  }
  return [...byLabel.entries()].map(([label, handle]) => ({ label, handle }));
}

function extractTwitterHandles(contents: string[]): Array<{ label: string; handle: string }> {
  const found = new Map<string, string>();

  for (const content of contents) {
    if (!/(twitter|x\.com|x handle|geeky_dan|devlabs_club|devlabs club)/i.test(content)) continue;

    const personal = content.match(/personal\s+twitter\s*:?\s*@?([a-zA-Z0-9_]+)/i);
    if (personal?.[1] && isValidTwitterHandle(personal[1])) {
      found.set("personal", personal[1].replace(/^@/, ""));
    }

    const devlabs = content.match(/devlabs\s+(?:twitter|x|account)\s*:?\s*@?([a-zA-Z0-9_]+)/i);
    if (devlabs?.[1] && isValidTwitterHandle(devlabs[1])) {
      found.set("devlabs", devlabs[1].replace(/^@/, ""));
    }

    if (/geeky_dan/i.test(content)) found.set("personal", "geeky_dan");
    if (/devlabs_club/i.test(content)) found.set("devlabs", "Devlabs_club");
  }

  return [...found.entries()]
    .filter(([, handle]) => isValidTwitterHandle(handle))
    .map(([label, handle]) => ({ label, handle }));
}

export function extractEmailsFromText(text: string): string[] {
  return [...new Set([...text.matchAll(/[\w.+-]+@[\w.-]+\.\w+/g)].map((m) => m[0]!))];
}
