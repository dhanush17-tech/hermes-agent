const STEER_PHRASES = /\b(instead|rather|actually|wait|hold on|stop|don't|do not|not that|change|skip|focus on|try|use the|open the|go to|check the|before you|after you|yes|no|cancel that)\b/i;
/**
 * True = new message should steer the active task (pause think, replan from current trace).
 * False = unrelated; active task continues, new message is a separate request.
 */
export async function classifySteeringRelevance(activeGoal, newMessage, cf) {
    const msg = newMessage.trim();
    const goal = activeGoal.trim();
    if (!msg || !goal)
        return false;
    if (STEER_PHRASES.test(msg))
        return true;
    const goalTokens = tokenize(goal);
    const msgTokens = tokenize(msg);
    const overlap = [...msgTokens].filter((t) => goalTokens.has(t)).length;
    if (overlap >= 2)
        return true;
    if (overlap >= 1 && msg.split(/\s+/).length <= 12)
        return true;
    if (!cf)
        return false;
    try {
        const raw = await cf.chat([
            `Active task: ${goal.slice(0, 500)}`,
            `New user message: ${msg.slice(0, 500)}`,
            "Does the new message steer, correct, or add to the active task (same workflow)?",
            'Reply ONLY JSON: {"related":true|false,"reason":"..."}',
        ].join("\n"), { classification: "unknown", maxTokens: 120, system: "Reply ONLY valid JSON." });
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start >= 0 && end > start) {
            const data = JSON.parse(raw.slice(start, end + 1));
            return Boolean(data.related);
        }
    }
    catch {
        /* fall through */
    }
    return false;
}
function tokenize(text) {
    return new Set(text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3));
}
//# sourceMappingURL=steering-classifier.js.map