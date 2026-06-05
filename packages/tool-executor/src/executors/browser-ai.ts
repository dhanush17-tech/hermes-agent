import type { ToolContext, ToolResult } from "@hermes-os/shared";
import { getBrowserSessionManager, BrowserControlError, approvalRequiredReason } from "@hermes-os/browser-control";
import { classifyBrowserAction } from "@hermes-os/browser-control";

function toResult(err: unknown): ToolResult {
  if (err instanceof BrowserControlError) {
    return { status: "denied", reason: err.message };
  }
  return { status: "denied", reason: err instanceof Error ? err.message : String(err) };
}

export async function executeBrowserAiObserve(payload: unknown): Promise<ToolResult> {
  const body = payload as { instruction?: string; pageId?: string };
  try {
    const manager = getBrowserSessionManager();
    const result = await manager.aiObserve(body.pageId, body.instruction ?? "What actions are available?");
    return { status: "success", data: result };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserAiAct(payload: unknown, ctx: ToolContext): Promise<ToolResult> {
  const body = payload as { instruction?: string; pageId?: string };
  if (!body.instruction?.trim()) return { status: "denied", reason: "instruction required" };
  const assessment = classifyBrowserAction({
    action: "click",
    url: "",
    element: { ref: "ai", tag: "button", name: body.instruction, selector: "", visible: true, risk: "none" },
  });
  const submitLike = /\b(send|submit|post|pay|delete|authorize)\b/i.test(body.instruction);
  if ((assessment.requiresApproval || submitLike) && !ctx.approvalId) {
    return { status: "denied", reason: approvalRequiredReason(`AI act: ${body.instruction.slice(0, 80)}`) };
  }
  try {
    const manager = getBrowserSessionManager();
    const result = await manager.aiAct(body.pageId, body.instruction);
    return { status: "success", data: result };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeBrowserAiExtract(payload: unknown): Promise<ToolResult> {
  const body = payload as { instruction?: string; pageId?: string };
  if (!body.instruction?.trim()) return { status: "denied", reason: "instruction required" };
  if (/\b(cookie|localStorage|password|secret)\b/i.test(body.instruction)) {
    return { status: "denied", reason: "Cannot extract secrets via AI extract" };
  }
  try {
    const manager = getBrowserSessionManager();
    const text = await manager.aiExtract(body.pageId, body.instruction);
    return { status: "success", data: { text: text.slice(0, 12_000) } };
  } catch (err) {
    return toResult(err);
  }
}
