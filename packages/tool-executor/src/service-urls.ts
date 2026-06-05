/** Known services — opened in the default browser; no API tokens required. */
export const SERVICE_URLS: Record<string, string> = {
  gmail: "https://mail.google.com",
  mail: "https://mail.google.com",
  email: "https://mail.google.com",
  inbox: "https://mail.google.com",
  calendar: "https://calendar.google.com",
  google_calendar: "https://calendar.google.com",
  twitter: "https://x.com",
  x: "https://x.com",
  linkedin: "https://www.linkedin.com/feed/",
  slack: "https://slack.com/signin",
  notion: "https://www.notion.so",
  drive: "https://drive.google.com",
  amazon: "https://www.amazon.com",
  github: "https://github.com",
};

export function inferServiceUrl(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [key, url] of Object.entries(SERVICE_URLS)) {
    if (lower.includes(key.replace("_", " ")) || lower.includes(key)) {
      return url;
    }
  }
  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch?.[0]) return urlMatch[0].replace(/[),.]+$/, "");
  return null;
}

export function twitterComposeUrl(text?: string): string {
  const base = "https://x.com/compose/post";
  if (!text?.trim()) return base;
  return `${base}?text=${encodeURIComponent(text.trim())}`;
}
