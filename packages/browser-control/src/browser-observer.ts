import type { BrowserObservation, InteractiveElement } from "./types.js";
import { BrowserRiskClassifier } from "./browser-risk-classifier.js";
import type { PlaywrightDriver } from "./playwright-driver.js";
import { SelectorStore } from "./selector-store.js";
import { BrowserControlError } from "./errors.js";

type RawElement = {
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
};

const EXTRACT_SCRIPT = `
(() => {
  const sel = (el, idx) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute('name');
    if (name) return tag + '[name="' + name.replace(/"/g, '\\\\"') + '"]';
    const aria = el.getAttribute('aria-label');
    if (aria) return tag + '[aria-label="' + aria.slice(0,40).replace(/"/g, '\\\\"') + '"]';
    return tag + ':nth-of-type(' + (idx + 1) + ')';
  };
  const nodes = Array.from(document.querySelectorAll(
    'a, button, input, textarea, select, [role=button], [role=link], [contenteditable=true], [aria-label]'
  ));
  const out = [];
  const counts = {};
  for (const el of nodes) {
    const tag = el.tagName.toLowerCase();
    const key = tag + (el.getAttribute('name') || el.getAttribute('aria-label') || '');
    counts[key] = (counts[key] || 0);
    const rect = el.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    out.push({
      tag,
      role: el.getAttribute('role') || undefined,
      name: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.getAttribute('value') || tag).slice(0, 120),
      text: (el.innerText || el.textContent || '').trim().slice(0, 200) || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      type: el.getAttribute('type') || undefined,
      selector: sel(el, counts[key]++),
      visible,
      box: visible ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
    });
  }
  const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 40).map((a, i) => ({
    ref: 'lnk_' + String(i + 1).padStart(3, '0'),
    text: (a.innerText || a.getAttribute('href') || '').trim().slice(0, 120),
    href: a.href,
  }));
  return {
    title: document.title,
    url: location.href,
    visibleText: (document.body?.innerText || '').slice(0, 12000),
    elements: out.slice(0, 80),
    links,
  };
})()
`;

export class BrowserObserver {
  private readonly classifier = new BrowserRiskClassifier();

  constructor(
    private readonly driver: PlaywrightDriver,
    private readonly selectors: SelectorStore,
  ) {}

  async observe(pageId: string): Promise<BrowserObservation> {
    const page = this.driver.getPage(pageId);
    if (!page) throw new BrowserControlError(`Page ${pageId} not found`, "NO_PAGE");

    let raw: {
      title: string;
      url: string;
      visibleText: string;
      elements: RawElement[];
      links: Array<{ ref: string; text: string; href: string }>;
    };

    try {
      raw = await page.evaluate(EXTRACT_SCRIPT);
    } catch {
      throw new BrowserControlError("DOM observation failed", "OBSERVE_FAILED");
    }

    const interactive: InteractiveElement[] = raw.elements.map((el, i) => {
      const ref = `el_${String(i + 1).padStart(3, "0")}`;
      const base = {
        ref,
        tag: el.tag,
        role: el.role,
        name: el.name,
        text: el.text,
        ariaLabel: el.ariaLabel,
        placeholder: el.placeholder,
        type: el.type,
        selector: el.selector,
        visible: el.visible,
        box: el.box,
      };
      return { ...base, risk: this.classifier.classifyElement(base) };
    });

    this.selectors.setPageElements(pageId, interactive);

    return {
      pageId,
      url: raw.url,
      title: raw.title,
      visibleText: this.classifier.sanitizePageText(raw.visibleText),
      interactive,
      forms: interactive
        .filter((e) => ["input", "textarea", "select"].includes(e.tag))
        .map((e) => ({ ref: e.ref, name: e.name, type: e.type, selector: e.selector })),
      links: raw.links.map((l, i) => ({
        ref: l.ref ?? `lnk_${String(i + 1).padStart(3, "0")}`,
        text: l.text,
        href: l.href,
      })),
      consoleErrors: [],
      networkState: "idle",
    };
  }
}
