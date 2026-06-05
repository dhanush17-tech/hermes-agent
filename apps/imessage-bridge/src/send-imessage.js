import { executeIMessageSend } from "@hermes-os/tool-executor";
export async function sendIMessage(recipient, body) {
    const result = await executeIMessageSend({ body, recipient });
    if (result.status === "success")
        return "sent";
    return result.status === "denied" ? result.reason : "failed";
}
//# sourceMappingURL=send-imessage.js.map