import type { AuditEventType, RiskLevel } from "@hermes-os/shared";
import { redactPayload } from "@hermes-os/shared";
import type { AuditRepository } from "@hermes-os/context-graph";

export type AuditLogParams = {
  eventType: AuditEventType;
  actor: string;
  toolName?: string;
  payload?: unknown;
  result?: unknown;
  riskLevel?: RiskLevel;
  approvalId?: string;
};

export class AuditLogger {
  private mirror?: (params: AuditLogParams & { createdAt: string }) => void;

  constructor(private readonly repo: AuditRepository) {}

  setMirror(fn: (params: AuditLogParams & { createdAt: string }) => void): void {
    this.mirror = fn;
  }

  async log(params: AuditLogParams): Promise<string> {
    const createdAt = new Date().toISOString();
    const payload = redactPayload(params.payload);
    const result = redactPayload(params.result);
    const id = await this.repo.insert({
      eventType: params.eventType,
      actor: params.actor,
      toolName: params.toolName,
      payload,
      result,
      riskLevel: params.riskLevel,
      approvalId: params.approvalId,
      createdAt,
    });
    this.mirror?.({
      ...params,
      payload,
      result,
      createdAt,
    });
    return id;
  }
}
