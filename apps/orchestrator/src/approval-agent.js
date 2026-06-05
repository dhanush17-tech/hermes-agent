export class ApprovalAgent {
    broker;
    executor;
    constructor(broker, executor) {
        this.broker = broker;
        this.executor = executor;
    }
    async handleIntent(entities, ctx) {
        const action = entities?.approvalAction;
        const id = entities?.approvalId?.trim();
        if (!action || !id) {
            return {
                reply: "Approval intent detected but missing approvalAction or approvalId in classifier output.",
            };
        }
        if (action === "approve") {
            const approval = await this.broker.getApproval(id);
            if (!approval) {
                return { reply: `No approval found for id ${id}` };
            }
            try {
                await this.broker.resolveApproval({
                    id,
                    decision: "approved",
                    actor: ctx.actor,
                    channel: ctx.channel,
                    expectedPayload: approval.exactPayload,
                    criticalConfirmed: entities?.criticalConfirmed === true,
                });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Approval failed";
                return { reply: msg };
            }
            const result = await this.executor.invoke(approval.actionType, approval.exactPayload, { ...ctx, approvalId: id }, { summary: approval.summary });
            if (result.status === "success") {
                return { reply: `Approved and executed ${approval.actionType}.`, executed: true };
            }
            return { reply: `Approved but execution failed: ${JSON.stringify(result)}` };
        }
        if (action === "deny") {
            await this.broker.resolveApproval({ id, decision: "denied", actor: ctx.actor });
            return { reply: `Denied approval ${id}.` };
        }
        if (action === "edit") {
            const prior = await this.broker.getApproval(id);
            if (!prior) {
                return { reply: `No approval found for id ${id}` };
            }
            await this.broker.resolveApproval({ id, decision: "denied", actor: ctx.actor });
            const newApproval = await this.broker.createApproval({
                actionType: prior.actionType,
                summary: `${prior.summary} (edited)`,
                exactPayload: {
                    ...prior.exactPayload,
                    edit: entities?.editText ?? "",
                },
                riskLevel: prior.riskLevel,
            });
            return { reply: this.broker.formatApprovalMessage(newApproval) };
        }
        return { reply: `Unsupported approval action: ${action}` };
    }
}
//# sourceMappingURL=approval-agent.js.map