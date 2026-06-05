export type ElementRisk = "none" | "medium" | "high" | "critical";

export type BrowserSession = {
  id: string;
  profileName: string;
  createdAt: string;
  lastUsedAt: string;
};

export type BrowserPage = {
  id: string;
  sessionId: string;
  url: string;
  title: string;
};

export type InteractiveElement = {
  ref: string;
  tag: string;
  role?: string;
  name: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  type?: string;
  selector: string;
  visible: boolean;
  box?: { x: number; y: number; width: number; height: number };
  risk: ElementRisk;
};

export type BrowserFormField = {
  ref: string;
  name: string;
  type?: string;
  selector: string;
};

export type BrowserLink = {
  ref: string;
  text: string;
  href: string;
};

export type BrowserObservation = {
  pageId: string;
  url: string;
  title: string;
  visibleText: string;
  interactive: InteractiveElement[];
  forms: BrowserFormField[];
  links: BrowserLink[];
  consoleErrors: string[];
  networkState: "idle" | "loading";
};

export type BrowserAction =
  | { type: "goto"; url: string }
  | { type: "click"; ref: string }
  | { type: "fill"; ref: string; value: string }
  | { type: "press"; key: string }
  | { type: "select"; ref: string; value: string }
  | { type: "extract"; instruction: string }
  | { type: "runScript"; code: string };

export type BrowserRiskAssessment = {
  risk: ElementRisk;
  reason: string;
  requiresApproval: boolean;
};
