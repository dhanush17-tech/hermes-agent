import { resolve, relative, isAbsolute } from "node:path";
import type { PolicyContext, PolicyEvaluation, RiskLevel } from "@hermes-os/shared";
import type { RiskPolicyFile, ApprovalRule } from "./risk-policy-schema.js";
import { isDestructiveTerminalCommand } from "./terminal-risk.js";

export class PolicyEngine {
  constructor(private readonly policy: RiskPolicyFile) {}

  evaluate(toolName: string, context: PolicyContext): PolicyEvaluation {
    if (this.policy.blocked.includes(toolName)) {
      return {
        allowed: false,
        risk: "high",
        requiresApproval: true,
        reason: `Tool '${toolName}' is blocked`,
      };
    }

    const rule = this.policy.tools[toolName];
    if (!rule) {
      if (this.policy.default === "deny_if_unknown") {
        return {
          allowed: false,
          risk: "high",
          requiresApproval: true,
          reason: `Unknown tool '${toolName}' denied by default`,
        };
      }
      return { allowed: true, risk: "low", requiresApproval: false };
    }

    const requiresApproval = this.resolveApproval(rule.approval, toolName, rule.risk, context);
    return {
      allowed: true,
      risk: rule.risk,
      requiresApproval,
    };
  }

  isBlocked(toolName: string): boolean {
    return this.policy.blocked.includes(toolName);
  }

  private resolveApproval(
    approval: ApprovalRule,
    toolName: string,
    risk: RiskLevel,
    context: PolicyContext,
  ): boolean {
    if (approval === false) return false;
    if (approval === true || approval === "always") return true;

    if (approval === "if_destructive") {
      if (toolName === "terminal.run" && context.terminalCommand) {
        return isDestructiveTerminalCommand(context.terminalCommand);
      }
      return risk === "high" || risk === "dynamic";
    }

    if (approval === "if_semantic_risk") {
      return true;
    }

    if (approval === "if_outside_workspace") {
      if (!context.targetPath) return true;
      const workspace = resolve(context.workspaceRoot);
      const target = isAbsolute(context.targetPath)
        ? resolve(context.targetPath)
        : resolve(workspace, context.targetPath);
      const rel = relative(workspace, target);
      return rel.startsWith("..") || isAbsolute(rel);
    }

    return true;
  }
}
