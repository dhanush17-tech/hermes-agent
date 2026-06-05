export const DEFAULT_VISION_MODEL = process.env.CLOUDFLARE_VISION_MODEL ?? "@cf/meta/llama-3.2-11b-vision-instruct";
export function extractVisionText(data) {
    const r = data.result;
    if (typeof r?.response === "string" && r.response.trim())
        return r.response.trim();
    if (typeof r?.description === "string" && r.description.trim())
        return r.description.trim();
    return "";
}
export function extractVisionError(data, status, body) {
    const msg = data.errors?.[0]?.message;
    if (msg)
        return msg;
    if (body)
        return `HTTP ${status}: ${body.slice(0, 280)}`;
    return `HTTP ${status}`;
}
//# sourceMappingURL=vision-image.js.map