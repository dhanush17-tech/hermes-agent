import { writeFile, mkdir } from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import type { ToolResult } from "@hermes-os/shared";

export type FilesystemWritePayload = {
  path?: string;
  content?: string;
};

export async function executeFilesystemWrite(
  payload: unknown,
  workspaceRoot: string,
): Promise<ToolResult> {
  const body = payload as FilesystemWritePayload;
  const rel = body.path?.trim();
  const content = body.content;
  if (!rel) return { status: "denied", reason: "path required" };
  if (content === undefined) return { status: "denied", reason: "content required" };

  const abs = isAbsolute(rel) ? resolve(rel) : resolve(workspaceRoot, rel);
  const relPath = relative(workspaceRoot, abs);
  if (relPath.startsWith("..") || isAbsolute(relPath)) {
    return { status: "denied", reason: "path outside workspace" };
  }

  if (relPath.startsWith("configs/risk-policy") || relPath.includes("node_modules")) {
    return { status: "denied", reason: "protected path" };
  }

  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
  return { status: "success", data: { path: relPath, bytes: content.length } };
}
