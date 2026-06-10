import { openRouterHealthCheck } from "@hermes-os/llm-client";
import type { ApprovalBroker } from "@hermes-os/approval-broker";
import type { AssistantStateRepository } from "@hermes-os/context-graph";
import type { MemoryService } from "@hermes-os/memory";

export type StatusServiceDeps = {
  stateRepo: AssistantStateRepository;
  broker: ApprovalBroker;
  memoryService: MemoryService;
};

export async function buildStatusOutput(deps: StatusServiceDeps): Promise<string> {
  const state = await deps.stateRepo.getState();
  const pending = await deps.broker.getPendingApprovals();
  const memoryCount = await deps.memoryService.count();
  const openRouterOk = await openRouterHealthCheck();

  return [
    `Assistant: ${state}`,
    `LLM: OpenRouter ${openRouterOk ? "up" : "down/unconfigured"}`,
    `Pending approvals: ${pending.length}`,
    `Memory count: ${memoryCount}`,
    `Supermemory: ${"supermemoryEnabled" in deps.memoryService && deps.memoryService.supermemoryEnabled ? "on" : "off"}`,
  ].join("\n");
}
