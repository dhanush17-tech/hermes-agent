import { createDefaultWorkflowRegistry, WorkflowEngine, } from "@hermes-os/workflows";
let engine = null;
export function getWorkflowEngine() {
    if (!engine) {
        engine = new WorkflowEngine(createDefaultWorkflowRegistry());
    }
    return engine;
}
export async function runWorkflow(workflowId, executor, ctx, inputs = {}) {
    const wf = getWorkflowEngine();
    try {
        return await wf.run(workflowId, {
            async invokeTool(tool, args) {
                const merged = { ...args, ...inputs };
                const result = await executor.invoke(tool, merged, ctx, { summary: `workflow:${workflowId}:${tool}` });
                if (result.status === "denied")
                    throw new Error(result.reason);
                if (result.status === "pending_approval")
                    throw new Error(result.message);
                return result.data;
            },
        }, inputs);
    }
    catch (err) {
        return {
            outputs: {},
            trace: [],
            failed: err instanceof Error ? err.message : String(err),
        };
    }
}
export function formatGmailWorkflowReply(outputs, accountEmail) {
    const search = outputs.search;
    const summary = outputs.summarize;
    const loops = outputs.loops;
    const lines = [`Gmail (${accountEmail}) — inbox check:`];
    if (search?.emails?.length) {
        lines.push(...search.emails.slice(0, 8).map((e) => `- ${e.from}: ${e.subject}`));
    }
    else if (typeof search?.count === "number") {
        lines.push(`${search.count} messages matched.`);
    }
    const summaryLines = Array.isArray(summary) ? summary : summary?.summary;
    if (summaryLines?.length) {
        lines.push("", "Summaries:", ...summaryLines.slice(0, 6));
    }
    const loopItems = Array.isArray(loops) ? loops : loops?.openLoops;
    if (loopItems?.length) {
        lines.push("", "Open loops:", ...loopItems.slice(0, 5).map((l) => `- ${l.description}`));
    }
    return lines.join("\n");
}
//# sourceMappingURL=workflow-runner.js.map