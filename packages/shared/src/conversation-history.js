export function formatConversationForPrompt(turns, maxTurns = 14) {
    if (!turns.length)
        return "";
    const slice = turns.slice(-maxTurns);
    const lines = slice.map((t) => t.role === "user" ? `User: ${t.content}` : `Assistant: ${t.content}`);
    return ["Recent conversation (stay on this thread):", ...lines].join("\n");
}
export function toChatApiHistory(turns, maxTurns = 14) {
    return turns.slice(-maxTurns).map((t) => ({
        role: t.role,
        content: t.content,
    }));
}
/** Short replies that rely on the prior turn (e.g. "what kind of feedback?"). */
export function augmentMessagingFollowUp(message, turns) {
    const trimmed = message.trim();
    if (trimmed.length > 60 || turns.length === 0)
        return trimmed;
    if (!/\b(what|which|how|why|who|when|where|that|those|this|it|they|feedback|mean)\b/i.test(trimmed)) {
        return trimmed;
    }
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    if (!lastUser)
        return trimmed;
    return `${trimmed}\n\n(Context: we were discussing: ${lastUser.content.slice(0, 300)})`;
}
//# sourceMappingURL=conversation-history.js.map