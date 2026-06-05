import { randomBytes } from "node:crypto";

export function generateId(prefix = ""): string {
  const id = randomBytes(4).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}
