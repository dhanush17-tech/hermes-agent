import { generateId } from "@hermes-os/shared";
import type { BrowserAction, BrowserObservation, BrowserPage, BrowserSession } from "./types.js";
import { PlaywrightDriver } from "./playwright-driver.js";
import { BrowserObserver } from "./browser-observer.js";
import { SelectorStore } from "./selector-store.js";
import { BrowserRiskClassifier, classifyBrowserAction } from "./browser-risk-classifier.js";
import { approvalRequiredReason, BrowserControlError } from "./errors.js";

const CREDENTIAL_STEP_DELAY_MS = process.env.VITEST === "true" ? 0 : 1800;

export class BrowserSessionManager {
  private session: BrowserSession | null = null;
  private activePageId: string | null = null;
  private readonly driver = new PlaywrightDriver();
  private readonly selectors = new SelectorStore();
  private readonly observer: BrowserObserver;
  private readonly classifier = new BrowserRiskClassifier();

  constructor() {
    this.observer = new BrowserObserver(this.driver, this.selectors);
  }

  get activePage(): string | null {
    return this.activePageId;
  }

  async launchPersistentProfile(profileName = "default"): Promise<BrowserSession> {
    this.session = await this.driver.launchPersistentProfile(profileName);
    return this.session;
  }

  async connectToCDP(endpoint?: string): Promise<BrowserSession> {
    this.session = await this.driver.connectToCDP(endpoint);
    return this.session;
  }

  async openPage(url: string, sessionId?: string): Promise<BrowserPage> {
    if (!this.session) {
      this.session = await this.driver.launchPersistentProfile("default");
    }
    const page = await this.driver.openPage(sessionId ?? this.session.id, url);
    this.activePageId = page.id;
    this.session.lastUsedAt = new Date().toISOString();
    return page;
  }

  listPages(): BrowserPage[] {
    return this.driver.listPages();
  }

  getPage(pageId: string): BrowserPage | null {
    return this.driver.listPages().find((p) => p.id === pageId) ?? null;
  }

  async closePage(pageId: string): Promise<void> {
    await this.driver.closePage(pageId);
    this.selectors.clearPage(pageId);
    if (this.activePageId === pageId) this.activePageId = null;
  }

  async observe(pageId?: string): Promise<BrowserObservation> {
    const id = pageId ?? this.activePageId;
    if (!id) throw new BrowserControlError("No active page — call browser.open first", "NO_PAGE");
    return this.observer.observe(id);
  }

  assessClick(pageId: string, ref: string) {
    const el = this.selectors.get(pageId, ref);
    const page = this.getPage(pageId);
    return classifyBrowserAction({
      action: "click",
      element: el,
      url: page?.url ?? "",
    });
  }

  assessFill(pageId: string, ref: string, value: string) {
    const el = this.selectors.get(pageId, ref);
    const page = this.getPage(pageId);
    return classifyBrowserAction({
      action: "fill",
      element: el,
      url: page?.url ?? "",
      value,
    });
  }

  async click(pageId: string, ref: string, approved = false): Promise<{ assessment: ReturnType<typeof classifyBrowserAction> }> {
    const el = this.selectors.get(pageId, ref);
    if (!el) throw new BrowserControlError(`Unknown ref ${ref}`, "NO_REF");
    const assessment = classifyBrowserAction({ action: "click", element: el, url: this.getPage(pageId)?.url ?? "" });
    if (assessment.requiresApproval && !approved) {
      throw new BrowserControlError(approvalRequiredReason(assessment.reason), "APPROVAL_REQUIRED");
    }
    await this.driver.click(pageId, el.selector);
    return { assessment };
  }

  async fill(pageId: string, ref: string, value: string, approved = false): Promise<void> {
    const el = this.selectors.get(pageId, ref);
    if (!el) throw new BrowserControlError(`Unknown ref ${ref}`, "NO_REF");
    const assessment = classifyBrowserAction({
      action: "fill",
      element: el,
      url: this.getPage(pageId)?.url ?? "",
      value,
    });
    if (assessment.requiresApproval && !approved) {
      throw new BrowserControlError(approvalRequiredReason(assessment.reason), "APPROVAL_REQUIRED");
    }
    await this.driver.fill(pageId, el.selector, value);
  }

  async fillCredentials(input: {
    pageId?: string;
    username: string;
    password: string;
    flow?: "same_page" | "multi_step";
    submit?: boolean;
  }): Promise<{ pageId: string; usernameRef: string; passwordRef: string; submitted: boolean }> {
    const id = input.pageId ?? this.activePageId;
    if (!id) throw new BrowserControlError("No active page — call browser.open first", "NO_PAGE");

    let obs = await this.observe(id);
    const usernameRef = findUsernameRef(obs);
    if (!usernameRef) {
      throw new BrowserControlError("Could not find username/email field on current page", "NO_REF");
    }

    await this.fill(id, usernameRef, input.username, true);

    let passwordRef = findPasswordRef(obs);
    if (input.flow === "multi_step" || !passwordRef) {
      await this.press(id, "Enter", usernameRef);
      await delay(CREDENTIAL_STEP_DELAY_MS);
      obs = await this.observe(id);
      passwordRef = findPasswordRef(obs);
    }

    if (!passwordRef) {
      throw new BrowserControlError("Could not find password field after entering username", "NO_REF");
    }

    await this.fill(id, passwordRef, input.password, true);
    const submitted = input.submit !== false;
    if (submitted) {
      await this.press(id, "Enter", passwordRef);
    }

    return { pageId: id, usernameRef, passwordRef, submitted };
  }

  async press(pageId: string, key: string, ref?: string): Promise<void> {
    const id = pageId ?? this.activePageId;
    if (!id) throw new BrowserControlError("No page", "NO_PAGE");
    const selector = ref ? this.selectors.get(id, ref)?.selector : "body";
    if (!selector) throw new BrowserControlError(`Unknown ref ${ref}`, "NO_REF");
    await this.driver.press(id, selector, key);
  }

  async extract(pageId: string, instruction: string): Promise<string> {
    const text = await this.driver.extractText(pageId);
    return `${instruction}\n\n--- page text ---\n${this.classifier.sanitizePageText(text).slice(0, 8000)}`;
  }

  async runScript(pageId: string, code: string, approved = false): Promise<unknown> {
    const assessment = classifyBrowserAction({
      action: "runScript",
      url: this.getPage(pageId)?.url ?? "",
      script: code,
    });
    if (assessment.requiresApproval && !approved) {
      throw new BrowserControlError(approvalRequiredReason(assessment.reason), "APPROVAL_REQUIRED");
    }
    return this.driver.evaluateSafe(pageId, code);
  }

  async screenshotFallback(pageId?: string): Promise<Buffer> {
    const id = pageId ?? this.activePageId;
    if (!id) throw new BrowserControlError("No page", "NO_PAGE");
    return this.driver.screenshot(id);
  }

  getPlaywrightPage(pageId?: string): unknown | null {
    const id = pageId ?? this.activePageId;
    if (!id) return null;
    return this.driver.getPlaywrightPage(id);
  }

  async aiObserve(pageId: string | undefined, instruction: string) {
    const page = this.getPlaywrightPage(pageId);
    if (!page) throw new BrowserControlError("No active page", "NO_PAGE");
    const { stagehandDriver } = await import("./stagehand-driver.js");
    return stagehandDriver.observe(page, instruction);
  }

  async aiAct(pageId: string | undefined, instruction: string) {
    const page = this.getPlaywrightPage(pageId);
    if (!page) throw new BrowserControlError("No active page", "NO_PAGE");
    const { stagehandDriver } = await import("./stagehand-driver.js");
    return stagehandDriver.act(page, instruction);
  }

  async aiExtract(pageId: string | undefined, instruction: string) {
    const page = this.getPlaywrightPage(pageId);
    if (!page) throw new BrowserControlError("No active page", "NO_PAGE");
    const { stagehandDriver } = await import("./stagehand-driver.js");
    return stagehandDriver.extract(page, instruction);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findUsernameRef(obs: BrowserObservation): string | null {
  const candidates = obs.interactive.filter(
    (el) =>
      el.visible &&
      ["input", "textarea"].includes(el.tag) &&
      el.type !== "password" &&
      el.type !== "hidden",
  );
  return (
    candidates.find((el) => /\b(email|e-mail|username|user name|login|identifier|phone)\b/i.test(fieldText(el))) ??
    candidates.find((el) => el.type === "email") ??
    candidates[0] ??
    null
  )?.ref ?? null;
}

function findPasswordRef(obs: BrowserObservation): string | null {
  return (
    obs.interactive.find(
      (el) =>
        el.visible &&
        ["input", "textarea"].includes(el.tag) &&
        (el.type === "password" || /\b(password|passcode)\b/i.test(fieldText(el))),
    )?.ref ?? null
  );
}

function fieldText(el: BrowserObservation["interactive"][number]): string {
  return [el.name, el.text, el.ariaLabel, el.placeholder, el.type].filter(Boolean).join(" ");
}

let defaultManager: BrowserSessionManager | null = null;

export function getBrowserSessionManager(): BrowserSessionManager {
  if (!defaultManager) defaultManager = new BrowserSessionManager();
  return defaultManager;
}

export function resetBrowserSessionManager(): void {
  defaultManager = null;
}
