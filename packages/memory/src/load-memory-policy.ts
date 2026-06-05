import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { findWorkspaceRoot } from "@hermes-os/shared";

const schema = z.object({
  store: z.array(z.string()).default([]),
  do_not_store: z.array(z.string()).default([]),
  required_fields: z.array(z.string()).default([]),
});

export type MemoryPolicy = z.infer<typeof schema>;

export function loadMemoryPolicy(configPath?: string): MemoryPolicy {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = configPath ?? resolve(root, "configs/memory-policy.yaml");
  return schema.parse(parse(readFileSync(path, "utf8")));
}
