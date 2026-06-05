import { HermesGatewayClient } from "./HermesModelProvider.js";
export function createHermesClientFromEnv() {
    const baseUrl = process.env.HERMES_API_URL?.replace(/\/$/, "");
    const apiKey = process.env.HERMES_API_KEY;
    if (!baseUrl || !apiKey)
        return null;
    return new HermesGatewayClient(baseUrl, apiKey);
}
//# sourceMappingURL=create-hermes-client.js.map