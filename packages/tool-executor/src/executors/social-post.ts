import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ToolResult } from "@hermes-os/shared";
import { executeBrowserGoto } from "./browser-goto.js";
import { browserGotoPayload } from "../default-browser.js";
import { executeScreenObserve } from "./screen-observe.js";
import { twitterComposeUrl } from "../service-urls.js";

export type SocialPostPayload = {
  text?: string;
  platform?: string;
};

/** Post via browser UI — never uses X/Twitter API tokens. */
export async function executeSocialPost(
  payload: unknown,
  workspaceRoot: string,
): Promise<ToolResult> {
  const body = payload as SocialPostPayload;
  const text = body.text?.trim();
  if (!text) return { status: "denied", reason: "text required" };

  const composeUrl = twitterComposeUrl(text);
  const nav = await executeBrowserGoto(browserGotoPayload(composeUrl));
  if (nav.status === "denied") return nav;

  const screen = await executeScreenObserve(workspaceRoot);

  const outDir = join(workspaceRoot, "data", "outbox");
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, `tweet-${Date.now()}.txt`);
  await appendFile(file, `${new Date().toISOString()}\n${text}\n\n`);

  return {
    status: "success",
    data: {
      posted: false,
      method: "laptop_control",
      platform: body.platform ?? "x",
      composeUrl,
      outboxFile: file,
      screenCapture:
        screen.status === "success" ?
          (screen.data as { capturePath?: string }).capturePath
        : undefined,
      hint: "Compose opened in your browser. Finish the post there or approve a follow-up UI step.",
    },
  };
}
