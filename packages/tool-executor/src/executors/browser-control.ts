import type { ToolContext, ToolResult } from "@hermes-os/shared";
import {
  getBrowserSessionManager,
  BrowserControlError,
  approvalRequiredReason,
} from "@hermes-os/browser-control";

function pageId(payload: unknown, manager: ReturnType<typeof getBrowserSessionManager>): string | null {
  const body = payload as { pageId?: string };
  return body.pageId ?? manager.activePage;
}

function toResult(err: unknown): ToolResult {
  if (err instanceof BrowserControlError) {
    if (err.code === "APPROVAL_REQUIRED") {
      return { status: "denied", reason: err.message };
    }
    return { status: "denied", reason: err.message };
  }
  return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
}

export async function executeBrowserOpen(payload: unknown): Promise<ToolResult> {
  const body = payload as { url?: string; profile?: string };
  if (!body.url?.trim()) return { status: "denied", reason: "url required" };
  try {
    const manager = getBrowserSessionManager();
    const page = await manager.openPage(body.url.trim());
    return {
      status: "success",
      data: { pageId: page.id, url: page.url, title: page.title, method: "playwright" },
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserObserve(payload: unknown): Promise<ToolResult> {
  try {
    const manager = getBrowserSessionManager();
    const id = pageId(payload, manager);
    if (!id) return { status: "denied", reason: "No page — call browser.open first" };
    const obs = await manager.observe(id);
    return {
      status: "success",
      data: {
        observation: obs,
        interactiveCount: obs.interactive.length,
        refs: obs.interactive.slice(0, 30).map((e) => ({ ref: e.ref, name: e.name, risk: e.risk })),
      },
    };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserClick(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  const body = payload as { ref?: string; pageId?: string };
  if (!body.ref?.trim()) return { status: "denied", reason: "ref required" };
  try {
    const manager = getBrowserSessionManager();
    const id = body.pageId ?? manager.activePage;
    if (!id) return { status: "denied", reason: "No page" };
    const assessment = manager.assessClick(id, body.ref);
    if (assessment.requiresApproval && !ctx.approvalId) {
      return { status: "denied", reason: approvalRequiredReason(assessment.reason) };
    }
    const result = await manager.click(id, body.ref, Boolean(ctx.approvalId));
    return { status: "success", data: { ref: body.ref, assessment: result.assessment } };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserFill(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  const body = payload as { ref?: string; value?: string; pageId?: string };
  if (!body.ref || body.value === undefined) return { status: "denied", reason: "ref and value required" };
  try {
    const manager = getBrowserSessionManager();
    const id = body.pageId ?? manager.activePage;
    if (!id) return { status: "denied", reason: "No page" };
    const assessment = manager.assessFill(id, body.ref, body.value);
    if (assessment.requiresApproval && !ctx.approvalId) {
      return { status: "denied", reason: approvalRequiredReason(assessment.reason) };
    }
    await manager.fill(id, body.ref, body.value, Boolean(ctx.approvalId));
    return { status: "success", data: { ref: body.ref, assessment } };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserPress(payload: unknown): Promise<ToolResult> {
  const body = payload as { key?: string; ref?: string; pageId?: string };
  if (!body.key?.trim()) return { status: "denied", reason: "key required" };
  try {
    const manager = getBrowserSessionManager();
    const id = body.pageId ?? manager.activePage;
    if (!id) return { status: "denied", reason: "No page" };
    await manager.press(id, body.key, body.ref);
    return { status: "success", data: { key: body.key } };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserExtract(payload: unknown): Promise<ToolResult> {
  const body = payload as { instruction?: string; pageId?: string };
  try {
    const manager = getBrowserSessionManager();
    const id = body.pageId ?? manager.activePage;
    if (!id) return { status: "denied", reason: "No page" };
    const text = await manager.extract(id, body.instruction ?? "Summarize this page");
    return { status: "success", data: { text: text.slice(0, 12_000) } };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserRunScript(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  const body = payload as { code?: string; pageId?: string };
  if (!body.code?.trim()) return { status: "denied", reason: "code required" };
  try {
    const manager = getBrowserSessionManager();
    const id = body.pageId ?? manager.activePage;
    if (!id) return { status: "denied", reason: "No page" };
    const data = await manager.runScript(id, body.code, Boolean(ctx.approvalId));
    return { status: "success", data };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserScreenshotFallback(payload: unknown): Promise<ToolResult> {
  try {
    const manager = getBrowserSessionManager();
    const id = pageId(payload, manager);
    if (!id) return { status: "denied", reason: "No page" };
    const buf = await manager.screenshotFallback(id);
    return { status: "success", data: { bytes: buf.length, fallback: true } };
  } catch (err) {
    return toResult(err);
  }
}
