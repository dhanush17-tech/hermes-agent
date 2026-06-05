export class MemoryAgent {
    memory;
    cf;
    constructor(memory, cf) {
        this.memory = memory;
        this.cf = cf;
    }
    async handle(userMessage, entities) {
        const action = entities?.memoryAction ?? "remember";
        if (action === "search") {
            const query = entities?.payloadText?.trim() || userMessage;
            const rows = await this.memory.search(query, 8);
            if (rows.length === 0)
                return "No matching memories.";
            return rows.map((r) => `- [${r.id}] (${r.memoryType}) ${r.content}`).join("\n");
        }
        if (action === "forget") {
            const id = entities?.memoryId ?? entities?.payloadText?.trim();
            if (!id) {
                const recent = await this.memory.listRecent(1);
                if (!recent[0])
                    return "No memories to forget.";
                await this.memory.forget(recent[0].id);
                return `Removed memory ${recent[0].id}.`;
            }
            await this.memory.forget(id);
            return `Removed memory ${id}.`;
        }
        const content = entities?.payloadText?.trim() || userMessage.trim();
        const memoryType = await this.inferMemoryType(content);
        const row = await this.memory.remember({
            content,
            memoryType,
            evidence: userMessage.slice(0, 300),
        });
        return `Stored memory ${row.id} (${row.memoryType}): ${row.content}`;
    }
    async inferMemoryType(content) {
        if (!this.cf)
            return "durable_facts";
        const raw = await this.cf.chat(`Classify memory type for: ${content}`, {
            maxTokens: 80,
            system: `Reply JSON only: {"memoryType": one of ${this.memory.allowedMemoryTypes().join("|")}}`,
        });
        try {
            const start = raw.indexOf("{");
            const end = raw.lastIndexOf("}");
            const data = JSON.parse(raw.slice(start, end + 1));
            if (data.memoryType && this.memory.allowedMemoryTypes().includes(data.memoryType)) {
                return data.memoryType;
            }
        }
        catch {
            /* default */
        }
        return "durable_facts";
    }
}
//# sourceMappingURL=memory-agent.js.map