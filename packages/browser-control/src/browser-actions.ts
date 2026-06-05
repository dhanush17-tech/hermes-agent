import type { BrowserSessionManager } from "./browser-session-manager.js";
import type { BrowserAction } from "./types.js";
import { BrowserControlError } from "./errors.js";

export async function executeBrowserAction(
  manager: BrowserSessionManager,
  action: BrowserAction,
  opts?: { pageId?: string; approved?: boolean },
): Promise<unknown> {
  const pageId = opts?.pageId ?? manager.activePage ?? undefined;
  if (!pageId && action.type !== "goto") {
    throw new BrowserControlError("No active page", "NO_PAGE");
  }

  switch (action.type) {
    case "goto": {
      const page = await manager.openPage(action.url);
      return page;
    }
    case "click":
      return manager.click(pageId!, action.ref, opts?.approved);
    case "fill":
      await manager.fill(pageId!, action.ref, action.value, opts?.approved);
      return { filled: action.ref };
    case "press":
      await manager.press(pageId!, action.key);
      return { key: action.key };
    case "select":
      await manager.fill(pageId!, action.ref, action.value, opts?.approved);
      return { selected: action.ref, value: action.value };
    case "extract":
      return { text: await manager.extract(pageId!, action.instruction) };
    case "runScript":
      return manager.runScript(pageId!, action.code, opts?.approved);
    default:
      throw new BrowserControlError("Unknown action", "ACTION_DENIED");
  }
}
