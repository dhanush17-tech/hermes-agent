import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { findWorkspaceRoot } from "@hermes-os/shared";

const schema = z.object({
  enabled: z.boolean().default(true),
  proactive_presence_scan: z.boolean().default(false),
  proactive_explore: z.boolean().default(false),
  notify_user_when_blocked: z.boolean().default(true),
  allow_self_edit_when_stuck: z.boolean().default(true),
});

export type AutonomyPolicy = z.infer<typeof schema>;

export function loadAutonomyPolicy(configPath?: string): AutonomyPolicy {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = configPath ?? resolve(root, "configs/autonomy-policy.yaml");
  return schema.parse(parse(readFileSync(path, "utf8")));
}

/** Arc Gmail/X/LinkedIn/Calendar rotation — off unless explicitly enabled. */
export function isPresenceScanEnabled(policy?: AutonomyPolicy): boolean {
  if (process.env.HERMES_DISABLE_PRESENCE_SCAN === "1") return false;
  if (process.env.HERMES_ENABLE_PRESENCE_SCAN === "1") return true;
  const autonomy = policy ?? loadAutonomyPolicy();
  return autonomy.proactive_presence_scan === true;
}
