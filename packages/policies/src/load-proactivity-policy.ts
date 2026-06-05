import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { findWorkspaceRoot } from "@hermes-os/shared";

const schema = z.object({
  immediate_score_min: z.number(),
  daily_brief_score_min: z.number(),
  silent_below: z.number(),
  may_notify_when: z.array(z.string()),
  must_not_notify_when: z.array(z.string()),
  scoring: z.object({
    formula: z.string(),
    scale_min: z.number(),
    scale_max: z.number(),
  }),
});

export type ProactivityPolicy = z.infer<typeof schema>;

export function loadProactivityPolicy(configPath?: string): ProactivityPolicy {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = configPath ?? resolve(root, "configs/proactivity-policy.yaml");
  return schema.parse(parse(readFileSync(path, "utf8")));
}
