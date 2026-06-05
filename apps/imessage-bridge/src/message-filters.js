/** Inbound SMS/iMessage that should never trigger Hermes (OTP, banks, Apple, etc.). */
const AUTOMATED_TEXT = [
    /\bOTP\b/i,
    /\bone[- ]time (?:password|code|pin)\b/i,
    /\bverification code\b/i,
    /\bApple ID [Cc]ode is\b/,
    /\bDo not share it with anyone\b/i,
    /\bDon't share it with anyone\b/i,
    /\bPlease find your OTP\b/i,
    /\bYour .{0,40} code is[:\s]/i,
    /\bis your (?:Apple|Google|Microsoft|Amazon|bank|login|security) code\b/i,
    /\buse this code to (?:verify|sign in|log in)\b/i,
    /\b(?:CVS|FedEx|UPS|USPS) .{0,30} (?:alert|notification|tracking)\b/i,
];
/** Service handles from chat.db — not a human texting Hermes. */
const SERVICE_HANDLE = [
    /\(smsft\)$/i,
    /^(apple|fedbnk|moh-online|noreply|no-reply|verify|alert|info|notify)$/i,
    /^[a-z][a-z0-9-]{1,30}$/i, // short alphanumeric brand ids (not phone/email)
];
const PHONE_OR_EMAIL = /^(\+\d{10,15}|\d{10,15}|[\w.+-]+@[\w.-]+\.\w+)$/;
export function isAutomatedInbound(text, handle) {
    const body = text.trim();
    if (!body)
        return true;
    for (const re of AUTOMATED_TEXT) {
        if (re.test(body))
            return true;
    }
    const norm = handle.trim().toLowerCase();
    if (norm.includes("(smsft)"))
        return true;
    for (const re of SERVICE_HANDLE) {
        if (re.test(norm) && !PHONE_OR_EMAIL.test(norm))
            return true;
    }
    // Pure short codes (5-6 digit SMS senders)
    if (/^\d{5,6}$/.test(norm.replace(/\D/g, "")) && norm.replace(/\D/g, "").length === norm.length) {
        return true;
    }
    return false;
}
export function shouldIgnoreInbound(text, handle) {
    return isAutomatedInbound(text, handle);
}
//# sourceMappingURL=message-filters.js.map