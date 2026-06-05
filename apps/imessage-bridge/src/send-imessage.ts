import { executeIMessageSend } from "@hermes-os/tool-executor";

export async function sendIMessage(recipient: string, body: string): Promise<string> {
  const result = await executeIMessageSend({ body, recipient });
  if (result.status === "success") return "sent";
  return result.status === "denied" ? result.reason : "failed";
}
