/** Shared sender allowlist helpers for iMessage and approval verification. */
export function normalizeHandle(handle) {
    return handle.replace(/\s/g, "").toLowerCase();
}
export function handleMatchKeys(handle) {
    const compact = normalizeHandle(handle);
    const keys = new Set([compact]);
    if (compact.includes("@"))
        return [...keys];
    const digits = compact.replace(/\D/g, "");
    if (digits.length >= 10)
        keys.add(digits);
    return [...keys];
}
export function loadApprovedSendersFromEnv() {
    const approved = new Set();
    const raw = process.env.APPROVED_IMESSAGE_SENDERS;
    if (raw) {
        try {
            const list = JSON.parse(raw);
            for (const s of list) {
                if (typeof s === "string" && s.trim()) {
                    for (const key of handleMatchKeys(s))
                        approved.add(key);
                }
            }
        }
        catch {
            /* invalid JSON */
        }
    }
    const defaultRecipient = process.env.IMESSAGE_DEFAULT_RECIPIENT;
    if (typeof defaultRecipient === "string" && defaultRecipient.trim()) {
        for (const key of handleMatchKeys(defaultRecipient))
            approved.add(key);
    }
    return approved;
}
export function isApprovedSender(handle, approved) {
    if (approved.size === 0)
        return false;
    for (const key of handleMatchKeys(handle)) {
        if (approved.has(key))
            return true;
    }
    return false;
}
//# sourceMappingURL=approved-senders.js.map