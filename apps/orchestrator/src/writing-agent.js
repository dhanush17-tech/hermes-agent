export class WritingAgent {
    cf;
    executor;
    constructor(cf, executor) {
        this.cf = cf;
        this.executor = executor;
    }
    async run(text, entities, ctx, options) {
        const draft = this.cf ?
            await this.cf.chat(text, {
                classification: "writing",
                maxTokens: 1024,
                system: "Draft polished message copy. Output only the message body.",
            })
            : text;
        if (!options?.send && entities?.toolName !== "imessage.send") {
            return `Draft:\n\n${draft}\n\n(Say send via iMessage to queue for approval.)`;
        }
        const result = await this.executor.invoke("imessage.send", { body: entities?.payloadText ?? draft }, ctx, { summary: "Send iMessage" });
        if (result.status === "pending_approval")
            return result.message;
        if (result.status === "denied")
            return `Denied: ${result.reason}`;
        return `Message queued/sent: ${JSON.stringify(result.data)}`;
    }
}
//# sourceMappingURL=writing-agent.js.map