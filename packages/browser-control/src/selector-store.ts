import type { InteractiveElement } from "./types.js";

/** pageId → ref → element metadata */
export class SelectorStore {
  private readonly byPage = new Map<string, Map<string, InteractiveElement>>();

  setPageElements(pageId: string, elements: InteractiveElement[]): void {
    const map = new Map<string, InteractiveElement>();
    for (const el of elements) map.set(el.ref, el);
    this.byPage.set(pageId, map);
  }

  get(pageId: string, ref: string): InteractiveElement | null {
    return this.byPage.get(pageId)?.get(ref) ?? null;
  }

  clearPage(pageId: string): void {
    this.byPage.delete(pageId);
  }
}
