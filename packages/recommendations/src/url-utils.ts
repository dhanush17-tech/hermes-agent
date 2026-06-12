const SEARCH_PAGE_PATTERNS = [
  /\/s\?k=/i,
  /google\.com\/search/i,
  /bing\.com\/search/i,
  /duckduckgo\.com\/\?q=/i,
  /\/search\?/i,
  /amazon\.com\/s\?/i,
  /walmart\.com\/search/i,
  /target\.com\/s\?/i,
  /bestbuy\.com\/site\/searchpage/i,
];

const PRODUCT_PAGE_HINTS = [
  /amazon\.com\/(dp|gp\/product)\//i,
  /walmart\.com\/ip\//i,
  /target\.com\/p\//i,
  /bestbuy\.com\/site\//i,
  /coopsleepgoods\.com\/products\//i,
  /\.com\/products\//i,
  /\/dp\//i,
  /\/product\//i,
];

export function isSearchPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return SEARCH_PAGE_PATTERNS.some((re) => re.test(u.href));
  } catch {
    return false;
  }
}

export function isDirectProductUrl(url: string): boolean {
  if (!url.startsWith("http")) return false;
  if (isSearchPageUrl(url)) return false;
  return PRODUCT_PAGE_HINTS.some((re) => re.test(url));
}

export function detectRetailer(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("amazon")) return "Amazon";
    if (host.includes("walmart")) return "Walmart";
    if (host.includes("target")) return "Target";
    if (host.includes("bestbuy")) return "Best Buy";
    if (host.includes("coopsleepgoods")) return "Coop Sleep Goods";
    return host.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

export function normalizeProductUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}
