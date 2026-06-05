import { generateId } from "@hermes-os/shared";
import type { SourceItemsRepository } from "@hermes-os/context-graph";
import type { Connector } from "./types.js";
import { ConnectorRouter, createDefaultAvailability } from "./connector-router.js";
import { MacCalendarConnector } from "./calendar/calendar-connector.js";
import { createGmailApiConnectorFromEnv } from "./gmail/gmail-api-connector.js";
import { createFileIndexerConnector } from "./files/index.js";
import { createGitHubConnectorFromEnv } from "./github/github-connector.js";
import { createScreenConnector } from "./screen-connector.js";

export type ConnectorHubResult = {
  ingested: number;
  errors: string[];
  byConnector: Record<string, number>;
};

export class ConnectorHub {
  private readonly connectors: Connector[];
  readonly router: ConnectorRouter;

  constructor(
    private readonly sourceItems: SourceItemsRepository,
    workspaceRoot: string,
    connectors?: Connector[],
  ) {
    this.router = new ConnectorRouter(createDefaultAvailability());
    this.connectors = connectors ?? createConnectorsFromEnv(workspaceRoot);
  }

  async scanAll(): Promise<ConnectorHubResult> {
    const now = new Date().toISOString();
    let ingested = 0;
    const errors: string[] = [];
    const byConnector: Record<string, number> = {};

    for (const connector of this.connectors) {
      const result = await connector.scan();
      if (result.error) errors.push(`${result.connector}: ${result.error}`);
      byConnector[result.connector] = result.items.length;

      for (const item of result.items) {
        await this.sourceItems.upsert({
          id: generateId("src"),
          sourceType: item.sourceType,
          externalId: item.externalId,
          title: item.title,
          content: item.content,
          metadata: item.metadata,
          createdAt: now,
          updatedAt: now,
        });
        ingested += 1;
      }
    }

    return { ingested, errors, byConnector };
  }
}

/** Connector-first ingest: structured API/local connectors before screen vision fallback. */
export function createConnectorsFromEnv(workspaceRoot: string): Connector[] {
  const router = new ConnectorRouter(createDefaultAvailability());
  const list: Connector[] = [];

  if (router.isStructuredPreferred("calendar") || process.platform === "darwin") {
    list.push(new MacCalendarConnector());
  }

  const gmail = createGmailApiConnectorFromEnv();
  if (gmail) list.push(gmail);

  const github = createGitHubConnectorFromEnv();
  if (github) list.push(github);

  list.push(createFileIndexerConnector(workspaceRoot));

  const needsScreenFallback =
    !router.isStructuredPreferred("gmail") ||
    !router.isStructuredPreferred("calendar");

  if (needsScreenFallback && process.env.HERMES_ENABLE_SCREEN_CONNECTOR !== "0") {
    list.push(createScreenConnector(workspaceRoot));
  }

  return list;
}

export function createDefaultConnectorHub(
  sourceItems: SourceItemsRepository,
  workspaceRoot: string,
): ConnectorHub {
  process.env.HERMES_OS_ROOT = workspaceRoot;
  return new ConnectorHub(sourceItems, workspaceRoot);
}
