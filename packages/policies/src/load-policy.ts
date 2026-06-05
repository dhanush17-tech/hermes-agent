import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { findWorkspaceRoot } from "@hermes-os/shared";
import { riskPolicySchema, type RiskPolicyFile } from "./risk-policy-schema.js";

export function loadRiskPolicy(policyPath?: string): RiskPolicyFile {
  const root = process.env.HERMES_OS_ROOT ?? findWorkspaceRoot();
  const path = policyPath ?? resolve(root, "configs/risk-policy.yaml");
  const raw = parse(readFileSync(path, "utf8")) as unknown;
  return riskPolicySchema.parse(raw);
}
