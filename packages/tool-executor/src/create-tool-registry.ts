import { readFile } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CloudflareWorkersAIClient, HermesModelProvider, ToolContext } from "@hermes-os/shared";
import type { MemoryService } from "@hermes-os/memory";
import { ToolRegistry } from "./registry.js";
import { MacroRegistry } from "./macro-registry.js";
import type { ToolExecutor } from "./tool-executor.js";
import { executeFilesystemWrite } from "./executors/filesystem-write.js";
import { executeToolsDefine } from "./executors/tools-define.js";
import { executeToolsRun } from "./executors/tools-run.js";
import { executeToolsAuthor } from "./executors/tools-author.js";
import { executeIMessageSend } from "./executors/imessage-send.js";
import { executeSocialPost } from "./executors/social-post.js";
import { executeCodeSelfEdit } from "./executors/code-self-edit.js";
import { executeCalendarList } from "./executors/calendar-connector.js";
import {
  executeConnectionConnect,
  executeConnectionList,
  executeConnectionRemove,
  executeConnectionRequest,
} from "./executors/connection-tools.js";
import { executeRideUber, executeRideLyft } from "./executors/ride-deeplinks.js";
import { executeScreenObserve } from "./executors/screen-observe.js";
import { executeBrowserGoto } from "./executors/browser-goto.js";
import { executeBrowserFillCredentials } from "./executors/browser-fill-credentials.js";
import { proposePatch, applyProposedPatch, rollbackCheckpoint, runWorkspaceTests } from "@hermes-os/code-tools";
import { getBrowserWorkbench } from "@hermes-os/browser-workbench";
import {
  executeBrowserOpen,
  executeBrowserObserve,
  executeBrowserClick,
  executeBrowserFill,
  executeBrowserPress,
  executeBrowserExtract,
  executeBrowserRunScript,
  executeBrowserScreenshotFallback,
} from "./executors/browser-control.js";
import {
  executeBrowserAiObserve,
  executeBrowserAiAct,
  executeBrowserAiExtract,
} from "./executors/browser-ai.js";
import {
  executeGmailCheckInbox,
  executeGmailSearch,
  executeGmailSummarizeThreads,
  executeGmailExtractOpenLoops,
  executeGmailSendDraft,
} from "./executors/gmail-connector.js";

const execFileAsync = promisify(execFile);

export type ToolRegistryDeps = {
  workspaceRoot: string;
  memory: MemoryService;
  hermes?: HermesModelProvider | null;
  cf?: CloudflareWorkersAIClient | null;
  /** Set after ToolExecutor is constructed — required for tools.run */
  executorRef?: { current: ToolExecutor | null };
};

export type ToolRegistryBundle = {
  registry: ToolRegistry;
  macros: MacroRegistry;
};

export function createToolRegistry(deps: ToolRegistryDeps): ToolRegistryBundle {
  const registry = new ToolRegistry();
  const root = resolve(deps.workspaceRoot);
  const macros = new MacroRegistry(join(root, "data", "custom-tools"));

  const safePath = (p: string): string | null => {
    const abs = isAbsolute(p) ? resolve(p) : resolve(root, p);
    const rel = relative(root, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return null;
    return abs;
  };

  registry.register({
    name: "memory.remember",
    async execute(payload) {
      const body = payload as { content?: string; memoryType?: string };
      if (!body.content?.trim()) {
        return { status: "denied", reason: "content required" };
      }
      const row = await deps.memory.remember({
        content: body.content,
        memoryType: body.memoryType,
      });
      return { status: "success", data: { id: row.id, content: row.content } };
    },
  });

  registry.register({
    name: "memory.forget",
    async execute(payload) {
      const body = payload as { memoryId?: string };
      if (!body.memoryId) return { status: "denied", reason: "memoryId required" };
      const ok = await deps.memory.forget(body.memoryId);
      return ok
        ? { status: "success", data: { forgotten: body.memoryId } }
        : { status: "denied", reason: "memory not found" };
    },
  });

  registry.register({
    name: "memory.search",
    async execute(payload) {
      const body = payload as { query?: string };
      const rows = await deps.memory.search(body.query ?? "", 10);
      return { status: "success", data: { memories: rows } };
    },
  });

  registry.register({
    name: "filesystem.write",
    async execute(payload) {
      return executeFilesystemWrite(payload, root);
    },
  });

  registry.register({
    name: "filesystem.read",
    async execute(payload) {
      const body = payload as { path?: string };
      if (!body.path) return { status: "denied", reason: "path required" };
      const abs = safePath(body.path);
      if (!abs) return { status: "denied", reason: "path outside workspace" };
      const content = await readFile(abs, "utf8");
      return {
        status: "success",
        data: { path: body.path, content: content.slice(0, 50_000) },
      };
    },
  });

  registry.register({
    name: "screen.observe",
    async execute() {
      return executeScreenObserve(root);
    },
  });

  registry.register({
    name: "browser.goto",
    async execute(payload) {
      return executeBrowserGoto(payload);
    },
  });

  registry.register({
    name: "browser.fill_credentials",
    async execute(payload) {
      return executeBrowserFillCredentials(payload);
    },
  });

  const workbench = getBrowserWorkbench();

  registry.register({ name: "browser.open", execute: executeBrowserOpen });
  registry.register({ name: "browser.observe", execute: executeBrowserObserve });
  registry.register({ name: "browser.fill", execute: (p, ctx) => executeBrowserFill(p, ctx) });
  registry.register({ name: "browser.press", execute: executeBrowserPress });
  registry.register({ name: "browser.extract", execute: executeBrowserExtract });
  registry.register({
    name: "browser.run_script",
    execute: (p, ctx) => executeBrowserRunScript(p, ctx),
  });
  registry.register({ name: "browser.screenshot_fallback", execute: executeBrowserScreenshotFallback });
  registry.register({ name: "browser.ai_observe", execute: executeBrowserAiObserve });
  registry.register({ name: "browser.ai_act", execute: (p, ctx) => executeBrowserAiAct(p, ctx) });
  registry.register({ name: "browser.ai_extract", execute: executeBrowserAiExtract });

  registry.register({ name: "gmail.check_inbox", execute: executeGmailCheckInbox });
  registry.register({ name: "gmail.search", execute: executeGmailSearch });
  registry.register({ name: "gmail.summarize_threads", execute: executeGmailSummarizeThreads });
  registry.register({ name: "gmail.extract_open_loops", execute: executeGmailExtractOpenLoops });
  registry.register({
    name: "gmail.send_draft",
    execute: (p, ctx) => executeGmailSendDraft(p, ctx),
  });

  registry.register({
    name: "browser.click",
    async execute(payload, ctx) {
      const body = payload as { ref?: string; selector?: string; label?: string; pageId?: string };
      if (body.ref) return executeBrowserClick(payload, ctx);
      return workbench.click({
        kind: "click",
        selector: body.selector,
        label: body.label,
      });
    },
  });

  registry.register({
    name: "browser.submit",
    async execute(payload) {
      const body = payload as { selector?: string; label?: string };
      return workbench.click({
        kind: "submit",
        selector: body.selector,
        label: body.label ?? "Submit",
      });
    },
  });

  registry.register({
    name: "browser.inspect",
    async execute() {
      return workbench.extractText();
    },
  });

  registry.register({
    name: "code.propose_patch",
    async execute(payload) {
      const body = payload as {
        instruction?: string;
        files?: Array<{ path?: string; content?: string }>;
      };
      if (!body.instruction?.trim()) return { status: "denied", reason: "instruction required" };
      const files = (body.files ?? [])
        .filter((f) => f.path && f.content !== undefined)
        .map((f) => ({ path: f.path!, content: f.content! }));
      const patch = await proposePatch(root, { instruction: body.instruction, files });
      return {
        status: "success",
        data: {
          patchId: patch.patchId,
          preview: patch.diffPreview.slice(0, 3000),
          files: patch.files,
        },
      };
    },
  });

  registry.register({
    name: "code.apply_patch_after_approval",
    async execute(payload) {
      const body = payload as { patchId?: string };
      if (!body.patchId) return { status: "denied", reason: "patchId required" };
      const result = await applyProposedPatch(root, body.patchId);
      return { status: "success", data: result };
    },
  });

  registry.register({
    name: "code.run_tests",
    async execute() {
      const result = await runWorkspaceTests(root);
      return result.ok
        ? { status: "success", data: result }
        : { status: "denied", reason: result.output.slice(0, 500), data: result };
    },
  });

  registry.register({
    name: "code.rollback",
    async execute(payload) {
      const body = payload as { checkpointId?: string };
      if (!body.checkpointId) return { status: "denied", reason: "checkpointId required" };
      const restored = await rollbackCheckpoint(root, body.checkpointId);
      return { status: "success", data: { restored } };
    },
  });

  registry.register({
    name: "web.fetch",
    async execute(payload) {
      const body = payload as { url?: string };
      if (!body.url) return { status: "denied", reason: "url required" };
      let parsed: URL;
      try {
        parsed = new URL(body.url);
      } catch {
        return { status: "denied", reason: "invalid url" };
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { status: "denied", reason: "only http(s) urls" };
      }
      const res = await fetch(parsed.toString(), {
        headers: { "User-Agent": "HermesPersonalOS/1.0" },
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      return {
        status: "success",
        data: {
          url: parsed.toString(),
          status: res.status,
          content: htmlToText(text).slice(0, 20_000),
        },
      };
    },
  });

  registry.register({
    name: "web.search",
    async execute(payload) {
      const body = payload as { query?: string };
      const query = body.query?.trim();
      if (!query) return { status: "denied", reason: "query required" };
      const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh) HermesPersonalOS/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        const html = await res.text();
        return {
          status: "success",
          data: { query, results: htmlToText(html).slice(0, 8_000) },
        };
      } catch (err) {
        return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  registry.register({
    name: "message_user",
    async execute(payload) {
      // Proactively ping the owner. Always targets the owner's own handle —
      // never an arbitrary recipient — so it can't be used to message others.
      const body = payload as { body?: string; text?: string };
      const text = (body.body ?? body.text ?? "").trim();
      if (!text) return { status: "denied", reason: "body required" };
      return executeIMessageSend({ body: text });
    },
  });

  registry.register({
    name: "terminal.run",
    async execute(payload, ctx) {
      const body = payload as { command?: string; cwd?: string };
      if (!body.command?.trim()) return { status: "denied", reason: "command required" };
      const cwd = body.cwd ? safePath(body.cwd) : root;
      if (!cwd) return { status: "denied", reason: "cwd outside workspace" };
      const { stdout, stderr } = await execFileAsync("sh", ["-c", body.command], {
        cwd,
        timeout: 60_000,
        maxBuffer: 512 * 1024,
      });
      return { status: "success", data: { stdout, stderr, actor: ctx.actor } };
    },
  });

  registry.register({
    name: "social.post",
    async execute(payload) {
      return executeSocialPost(payload, root);
    },
  });

  registry.register({
    name: "code.self_edit",
    async execute(payload) {
      return executeCodeSelfEdit(payload, root);
    },
  });

  registry.register({
    name: "calendar.list",
    async execute(payload) {
      return executeCalendarList(payload);
    },
  });

  registry.register({
    name: "connection.list",
    async execute() {
      return executeConnectionList();
    },
  });
  registry.register({
    name: "connection.connect",
    async execute(payload) {
      return executeConnectionConnect(payload);
    },
  });
  registry.register({
    name: "connection.remove",
    async execute(payload) {
      return executeConnectionRemove(payload);
    },
  });
  registry.register({
    name: "connection.request",
    async execute(payload) {
      return executeConnectionRequest(payload);
    },
  });

  registry.register({
    name: "ride.uber",
    async execute(payload) {
      return executeRideUber(payload);
    },
  });

  registry.register({
    name: "ride.lyft",
    async execute(payload) {
      return executeRideLyft(payload);
    },
  });

  registry.register({
    name: "imessage.send",
    async execute(payload) {
      return executeIMessageSend(payload);
    },
  });

  registry.register({
    name: "tools.define",
    async execute(payload) {
      return executeToolsDefine(payload, macros);
    },
  });

  registry.register({
    name: "tools.author",
    async execute(payload) {
      return executeToolsAuthor(payload, macros, deps.cf ?? null, registry.listNames());
    },
  });

  registry.register({
    name: "tools.run",
    async execute(payload, ctx) {
      const ex = deps.executorRef?.current;
      if (!ex) return { status: "denied", reason: "executor not ready" };
      return executeToolsRun(payload, ctx, macros, ex);
    },
  });

  return { registry, macros };
}

/** Strip HTML to readable text so the model isn't fed markup noise. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

