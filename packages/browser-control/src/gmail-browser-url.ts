/** Gmail URL that switches to a specific logged-in Google account in the browser. */
export function gmailInboxUrl(email: string, query?: string): string {
  const authuser = encodeURIComponent(email);
  if (query?.trim()) {
    return `https://mail.google.com/mail/?authuser=${authuser}#search/${encodeURIComponent(query)}`;
  }
  return `https://mail.google.com/mail/?authuser=${authuser}#inbox`;
}

export function gmailAccountsMatch(url: string, email: string): boolean {
  try {
    const u = new URL(url);
    const authuser = u.searchParams.get("authuser");
    if (authuser && authuser.toLowerCase() === email.toLowerCase()) return true;
    return url.includes(encodeURIComponent(email)) || url.includes(email);
  } catch {
    return url.includes(email);
  }
}

export function isGmailHost(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("mail.google.com");
}
