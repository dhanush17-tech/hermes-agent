import type { SourceItemRow } from "@hermes-os/context-graph";

export type ConnectorScanResult = {
  connector: string;
  items: Omit<SourceItemRow, "id" | "createdAt" | "updatedAt">[];
  error?: string;
};

export interface Connector {
  readonly name: string;
  scan(): Promise<ConnectorScanResult>;
}
