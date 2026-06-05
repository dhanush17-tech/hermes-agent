import type { ToolContext, ToolResult } from "@hermes-os/shared";

export interface ToolDefinition {
  name: string;
  execute(payload: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  listNames(): string[] {
    return [...this.tools.keys()].sort();
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export function createDefaultMockTools(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "social.post",
    async execute(payload) {
      return { status: "success", data: { posted: true, payload } };
    },
  });

  registry.register({
    name: "code.self_edit",
    async execute(payload) {
      return { status: "success", data: { edited: true, payload } };
    },
  });

  registry.register({
    name: "imessage.send",
    async execute(payload) {
      return { status: "success", data: { sent: true, payload } };
    },
  });

  return registry;
}
