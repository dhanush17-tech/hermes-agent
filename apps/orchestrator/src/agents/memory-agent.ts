import {
  llmJson,
  MODELS,
  validateMemoryOperation,
} from "@hermes-os/llm-client";
import type { MemoryService } from "@hermes-os/memory";

const MEMORY_AGENT_PROMPT = `You are the Hermes memory manager.

Given a user request to remember, forget, or search, determine the exact memory operation.
Return JSON only with fields: operation, content, memory_type, confidence, scope, tags, search_query, response.

REMEMBER: rewrite as a clean durable statement; assign memory_type and confidence 0.5-1.0.
FORGET: set search_query to find the memory; response explains what you'll do.
SEARCH: set search_query; response summarizes findings briefly.

NEVER store: passwords, raw credentials, SSNs, full credit card numbers, one-time codes.`;

export async function runMemoryAgent(
  userMessage: string,
  memoryService: MemoryService,
): Promise<{ response: string }> {
  const operation = await llmJson({
    model: MODELS.FAST,
    temperature: 0.1,
    max_tokens: 512,
    messages: [
      { role: "system", content: MEMORY_AGENT_PROMPT },
      { role: "user", content: userMessage },
    ],
    validate: validateMemoryOperation,
  });

  switch (operation.operation) {
    case "remember": {
      if (!operation.content) {
        return { response: operation.response || "I couldn't determine what to remember." };
      }
      await memoryService.remember({
        content: operation.content,
        memoryType: operation.memory_type ?? "durable_facts",
        scope: operation.scope ?? "default",
        source: "user_explicit",
      });
      break;
    }
    case "forget": {
      if (operation.search_query) {
        const results = await memoryService.search(operation.search_query, 3);
        if (results.length === 1) {
          await memoryService.forget(results[0]!.id);
        } else if (results.length > 1) {
          return {
            response: `Found ${results.length} memories that match. Which one?\n${results.map((r, i) => `${i + 1}. ${r.content}`).join("\n")}`,
          };
        } else {
          return { response: "I couldn't find a matching memory to forget." };
        }
      }
      break;
    }
    case "search": {
      const results = await memoryService.search(operation.search_query ?? userMessage, 8);
      if (results.length === 0) {
        return { response: "I don't have anything stored about that." };
      }
      return { response: results.map((r) => `• ${r.content}`).join("\n") };
    }
  }

  return { response: operation.response };
}
