import { createHash } from "node:crypto";
export function stableStringify(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
    if (value === null || typeof value !== "object") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    const obj = value;
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortKeys(obj[key]);
    }
    return sorted;
}
export function hashPayload(payload) {
    return createHash("sha256").update(stableStringify(payload)).digest("hex");
}
//# sourceMappingURL=hash.js.map