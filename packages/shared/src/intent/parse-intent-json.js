import { isValidClassification } from "./intent-catalog.js";
function extractJsonObject(raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1])
        return fenced[1].trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start)
        return raw.slice(start, end + 1);
    return null;
}
function parseEntities(raw) {
    if (!raw || typeof raw !== "object")
        return undefined;
    const e = raw;
    const entities = {};
    if (e.approvalAction === "approve" || e.approvalAction === "deny" || e.approvalAction === "edit") {
        entities.approvalAction = e.approvalAction;
    }
    if (typeof e.approvalId === "string" && e.approvalId.trim()) {
        entities.approvalId = e.approvalId.trim();
    }
    if (typeof e.criticalConfirmed === "boolean") {
        entities.criticalConfirmed = e.criticalConfirmed;
    }
    if (typeof e.editText === "string")
        entities.editText = e.editText;
    if (e.assistantControl === "status" ||
        e.assistantControl === "pause" ||
        e.assistantControl === "resume" ||
        e.assistantControl === "emergency_stop") {
        entities.assistantControl = e.assistantControl;
    }
    if (typeof e.researchContinue === "boolean")
        entities.researchContinue = e.researchContinue;
    if (typeof e.researchEnd === "boolean")
        entities.researchEnd = e.researchEnd;
    const tools = [
        "social.post",
        "code.self_edit",
        "imessage.send",
        "web.fetch",
        "screen.observe",
        "browser.goto",
        "memory.remember",
        "memory.forget",
        "terminal.run",
        "filesystem.write",
        "tools.define",
        "tools.author",
        "tools.run",
    ];
    if (typeof e.toolName === "string" && tools.includes(e.toolName)) {
        entities.toolName = e.toolName;
    }
    if (typeof e.payloadText === "string")
        entities.payloadText = e.payloadText;
    if (typeof e.url === "string" && e.url.trim())
        entities.url = e.url.trim();
    if (e.memoryAction === "remember" || e.memoryAction === "forget" || e.memoryAction === "search") {
        entities.memoryAction = e.memoryAction;
    }
    if (typeof e.memoryId === "string" && e.memoryId.trim())
        entities.memoryId = e.memoryId.trim();
    return Object.keys(entities).length > 0 ? entities : undefined;
}
export function parseIntentJson(raw) {
    const jsonText = extractJsonObject(raw);
    if (!jsonText)
        return null;
    try {
        const data = JSON.parse(jsonText);
        const intent = typeof data.intent === "string" ? data.intent : "";
        if (!isValidClassification(intent))
            return null;
        const confidence = typeof data.confidence === "number" ? Math.min(1, Math.max(0, data.confidence)) : 0.5;
        return {
            intent,
            confidence,
            reasoning: typeof data.reasoning === "string" ? data.reasoning : undefined,
            entities: parseEntities(data.entities),
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=parse-intent-json.js.map