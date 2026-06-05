import { hasGoogleOAuthConfigured } from "./google/google-auth.js";

export type ConnectorCapability =
  | "read"
  | "search"
  | "summarize"
  | "extract_open_loops"
  | "draft"
  | "send"
  | "write";

export type ConnectorMethod = "api" | "local_db" | "browser_dom" | "screen_vision";

export type ConnectorRoute = {
  surface: string;
  preferred: ConnectorMethod;
  fallbackOrder: ConnectorMethod[];
};

export const CONNECTOR_ROUTES: Record<string, ConnectorMethod[]> = {
  gmail: ["api", "browser_dom", "screen_vision"],
  calendar: ["api", "local_db", "browser_dom", "screen_vision"],
  github: ["api", "browser_dom", "screen_vision"],
  x: ["browser_dom", "screen_vision"],
  linkedin: ["browser_dom", "screen_vision"],
  local_files: ["local_db"],
};

export type ConnectorAvailability = Partial<Record<string, ConnectorMethod[]>>;

export function createDefaultAvailability(): ConnectorAvailability {
  const avail: ConnectorAvailability = {
    local_files: ["local_db"],
    calendar: process.platform === "darwin" ? ["local_db"] : [],
    github: process.env.GITHUB_TOKEN?.trim() ? ["api"] : [],
    gmail: hasGoogleOAuthConfigured() ? ["api"] : [],
    x: [],
    linkedin: [],
  };
  if (process.env.HERMES_ENABLE_SCREEN_CONNECTOR !== "0") {
    for (const surface of ["gmail", "calendar", "x", "linkedin"]) {
      avail[surface] = [...(avail[surface] ?? []), "screen_vision"];
    }
  }
  return avail;
}

export class ConnectorRouter {
  constructor(private readonly availability: ConnectorAvailability = createDefaultAvailability()) {}

  route(surface: string): ConnectorMethod | null {
    const order = CONNECTOR_ROUTES[surface] ?? ["api", "local_db", "browser_dom", "screen_vision"];
    const available = this.availability[surface] ?? [];
    for (const method of order) {
      if (available.includes(method)) return method;
    }
    return null;
  }

  preferredMethod(surface: string): ConnectorMethod | null {
    return this.route(surface);
  }

  isStructuredPreferred(surface: string): boolean {
    const method = this.route(surface);
    return method === "api" || method === "local_db";
  }

  fallbackChain(surface: string): ConnectorMethod[] {
    const order = CONNECTOR_ROUTES[surface] ?? [];
    const available = this.availability[surface] ?? [];
    return order.filter((m) => available.includes(m));
  }
}
