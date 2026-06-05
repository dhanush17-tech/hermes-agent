import { z } from "zod";

export const approvalRuleSchema = z.union([
  z.literal(false),
  z.literal(true),
  z.literal("always"),
  z.literal("if_destructive"),
  z.literal("if_semantic_risk"),
  z.literal("if_outside_workspace"),
]);

export const toolRuleSchema = z.object({
  risk: z.enum(["read", "low", "medium", "high", "dynamic"]),
  approval: approvalRuleSchema,
});

export const riskPolicySchema = z.object({
  default: z.literal("deny_if_unknown"),
  tools: z.record(toolRuleSchema),
  blocked: z.array(z.string()),
});

export type RiskPolicyFile = z.infer<typeof riskPolicySchema>;
export type ApprovalRule = z.infer<typeof approvalRuleSchema>;
