import type { IntentEntities, RequestClassification } from "@hermes-os/shared";

export type ToolInvocation = {
  toolName: string;
  payload: unknown;
  summary: string;
  targetPath?: string;
  terminalCommand?: string;
};

export class OperatorAgent {
  plan(
    classification: RequestClassification,
    text: string,
    entities?: IntentEntities,
  ): ToolInvocation | null {
    const payloadText = entities?.payloadText?.trim() || text.trim();

    if (entities?.toolName) {
      return this.fromToolName(entities.toolName, payloadText, entities, text);
    }

    if (classification === "laptop_control") {
      return null;
    }

    if (classification === "coding") {
      return {
        toolName: "code.self_edit",
        payload: { instruction: payloadText, scope: "monorepo" },
        summary: "Edit Personal OS codebase",
      };
    }

    if (classification === "writing") {
      return {
        toolName: "imessage.send",
        payload: { body: payloadText },
        summary: "Send iMessage",
      };
    }

    return null;
  }

  private fromToolName(
    toolName: IntentEntities["toolName"],
    payloadText: string,
    entities: IntentEntities,
    text: string,
  ): ToolInvocation | null {
    switch (toolName) {
      case "social.post":
        return {
          toolName: "social.post",
          payload: { text: payloadText, platform: "x" },
          summary: "Post to X",
        };
      case "code.self_edit":
        return {
          toolName: "code.self_edit",
          payload: { instruction: payloadText, scope: "monorepo" },
          summary: "Edit Personal OS codebase",
        };
      case "imessage.send":
        return {
          toolName: "imessage.send",
          payload: { body: payloadText },
          summary: "Send iMessage",
        };
      case "web.fetch":
        return {
          toolName: "browser.goto",
          payload: { url: entities.url ?? payloadText },
          summary: `Open ${entities.url ?? "url"} in browser`,
        };
      case "screen.observe":
        return {
          toolName: "screen.observe",
          payload: {},
          summary: "Capture screen",
        };
      case "browser.goto":
        return {
          toolName: "browser.goto",
          payload: { url: entities.url ?? payloadText },
          summary: `Open ${entities.url ?? "url"}`,
        };
      case "memory.remember":
        return {
          toolName: "memory.remember",
          payload: { content: payloadText },
          summary: "Store memory",
        };
      case "memory.forget":
        return {
          toolName: "memory.forget",
          payload: { memoryId: entities.memoryId ?? payloadText },
          summary: "Forget memory",
        };
      case "terminal.run":
        return {
          toolName: "terminal.run",
          payload: { command: payloadText },
          summary: "Run terminal command",
          terminalCommand: payloadText,
        };
      case "filesystem.write":
        return {
          toolName: "filesystem.write",
          payload: { path: entities.url ?? "data/generated.txt", content: payloadText },
          summary: "Write file in workspace",
        };
      case "tools.author":
        return {
          toolName: "tools.author",
          payload: { requirement: payloadText, name: entities.url },
          summary: "Author custom tool macro",
        };
      case "tools.define":
        return {
          toolName: "tools.define",
          payload: { name: entities.url, description: payloadText },
          summary: "Define custom tool macro",
        };
      case "tools.run":
        return {
          toolName: "tools.run",
          payload: { name: entities.url ?? payloadText },
          summary: "Run custom macro",
        };
      default:
        return null;
    }
  }
}
