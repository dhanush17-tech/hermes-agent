import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Max dimension for vision API — full Retina screenshots often break LLaVA/Llama vision. */
const MAX_VISION_PX = Number(process.env.HERMES_VISION_MAX_PX ?? 1280);

export type PreparedVisionImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
  width?: number;
};

export async function prepareVisionImage(capturePath: string): Promise<PreparedVisionImage> {
  if (process.platform === "darwin") {
    const out = join(tmpdir(), `hermes-vision-${Date.now()}.jpg`);
    try {
      await execFileAsync("sips", ["-Z", String(MAX_VISION_PX), capturePath, "--out", out], {
        timeout: 15_000,
      });
      const buffer = await readFile(out);
      await unlink(out).catch(() => undefined);
      if (buffer.length > 0) {
        return { buffer, mimeType: "image/jpeg" };
      }
    } catch {
      /* fall through to raw png */
    }
  }

  const buffer = await readFile(capturePath);
  return { buffer, mimeType: "image/png" };
}
