import type { PolicyContext, ToolContext, ToolResult, RiskLevelApproval } from "@hermes-os/shared";
import type { PolicyEngine } from "@hermes-os/policies";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { AuditLogger } from "@hermes-os/audit-log";
import type { ToolRegistry } from "./registry.js";

export type InvokeOptions = {
  targetPath?: string;
  terminalCommand?: string;
  summary?: string;
};

export class ToolExecutor {
  constructor(
    private readonly policy: PolicyEngine,
    private readonly broker: ApprovalBroker,
    private readonly audit: AuditLogger,
    private readonly registry: ToolRegistry,
  ) {}

  async invoke(
    toolName: string,
    payload: unknown,
    ctx: ToolContext,
    options: InvokeOptions = {},
  ): Promise<ToolResult> {
    const policyCtx: PolicyContext = {
      workspaceRoot: ctx.workspaceRoot,
      targetPath: options.targetPath,
      terminalCommand: options.terminalCommand,
    };

    const evaluation = this.policy.evaluate(toolName, policyCtx);

    await this.audit.log({
      eventType: "tool_call_requested",
      actor: ctx.actor,
      toolName,
      payload,
      riskLevel: evaluation.risk,
    });

    if (!evaluation.allowed) {
      await this.audit.log({
        eventType: "tool_call_denied",
        actor: ctx.actor,
        toolName,
        result: { reason: evaluation.reason ?? "denied" },
        riskLevel: evaluation.risk,
      });
      return { status: "denied", reason: evaluation.reason ?? "Tool not allowed" };
    }

    const tool = this.registry.get(toolName);
    if (!tool) {
      await this.audit.log({
        eventType: "tool_call_denied",
        actor: ctx.actor,
        toolName,
        result: { reason: "Tool not registered" },
      });
      return { status: "denied", reason: `Tool not registered: ${toolName}` };
    }

    if (evaluation.requiresApproval && !ctx.approvalId) {
      const riskLevel: RiskLevelApproval =
        evaluation.risk === "high" || evaluation.risk === "dynamic"
          ? "high"
          : "medium";

      const approval = await this.broker.createApproval({
        actionType: toolName,
        summary: options.summary ?? `Execute ${toolName}`,
        exactPayload: payload,
        riskLevel,
      });

      return {
        status: "pending_approval",
        approvalId: approval.id,
        message: this.broker.formatApprovalMessage(approval),
      };
    }

    if (ctx.approvalId) {
      try {
        await this.broker.validateLeaseForExecution({
          approvalId: ctx.approvalId,
          toolName,
          payload,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Lease validation failed";
        await this.audit.log({
          eventType: "tool_call_denied",
          actor: ctx.actor,
          toolName,
          result: { reason },
          approvalId: ctx.approvalId,
        });
        return { status: "denied", reason };
      }
    }

    const result = await tool.execute(payload, ctx);

    if (
      result.status === "denied" &&
      typeof result.reason === "string" &&
      result.reason.includes("[requiresApproval]")
    ) {
      const approval = await this.broker.createApproval({
        actionType: toolName,
        summary: options.summary ?? result.reason.replace("[requiresApproval]", "").trim(),
        exactPayload: payload,
        riskLevel: "high",
      });
      await this.audit.log({
        eventType: "approval_requested",
        actor: ctx.actor,
        toolName,
        payload,
        approvalId: approval.id,
      });
      return {
        status: "pending_approval",
        approvalId: approval.id,
        message: this.broker.formatApprovalMessage(approval),
      };
    }

    if (ctx.approvalId && result.status === "success") {
      await this.broker.consumeLease(ctx.approvalId);
    }

    await this.audit.log({
      eventType: "tool_call_executed",
      actor: ctx.actor,
      toolName,
      payload,
      result,
      approvalId: ctx.approvalId,
    });

    return result;
  }
}
