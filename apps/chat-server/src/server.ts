import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { ActivityRow } from "@hermes-os/audit-log";
import { formatActivityLine } from "@hermes-os/audit-log";
import { createDb, RisksRepository } from "@hermes-os/context-graph";
import type { PersonalOsSystem } from "@hermes-os/orchestrator/system";
import { ChatRunManager, type ServerEvent } from "./run-manager.js";
import { handleControlApi } from "./control-api.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../public");
const PORT = Number(process.env.HERMES_CHAT_PORT ?? 3847);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function startChatServer(system: PersonalOsSystem): void {
  const { db } = createDb(system.dbPath);
  const risksRepo = new RisksRepository(db);
  const clients = new Set<WebSocket>();
  const broadcast = (payload: unknown) => {
    const raw = JSON.stringify(payload);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(raw);
    }
  };

  const runManager = new ChatRunManager(system.orchestrator, (event: ServerEvent) => {
    broadcast(event);
  });

  const unsubscribe = system.activity.subscribe((row: ActivityRow) => {
    broadcast({
      type: "activity",
      line: formatActivityLine(row),
      row,
    });
  });

  const httpServer = createServer(async (req, res) => {
    try {
      await handleHttp(req, res, runManager, system, risksRepo);
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "Server error");
    }
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify(runManager.getStatus()));

    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(String(data)) as { type?: string; text?: string };
        if (msg.type === "message" && msg.text) {
          await runManager.submit(msg.text);
        } else if (msg.type === "interrupt") {
          await runManager.interrupt();
        } else if (msg.type === "status") {
          ws.send(JSON.stringify(runManager.getStatus()));
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: "error",
            runId: "",
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    });

    ws.on("close", () => clients.delete(ws));
  });

  httpServer.listen(PORT, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${PORT}`;
    console.log(`Hermes chat UI: ${url}`);
    console.log("Send a related message to steer; unrelated messages run in parallel.");
    if (process.env.HERMES_CHAT_NO_OPEN !== "1" && process.platform === "darwin") {
      execFile("open", [url], () => undefined);
    }
  });

  const shutdown = () => {
    unsubscribe();
    wss.close();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  runManager: ChatRunManager,
  system: PersonalOsSystem,
  risksRepo: RisksRepository,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (await handleControlApi(url.pathname, req.method ?? "GET", system, risksRepo, res)) {
    return;
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(runManager.getStatus()));
    return;
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const body = await readBody(req);
    const { text } = JSON.parse(body) as { text?: string };
    if (!text?.trim()) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "text required" }));
      return;
    }
    const result = await runManager.submit(text);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result));
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (filePath.includes("..")) {
    res.statusCode = 400;
    res.end("Bad path");
    return;
  }

  const abs = join(PUBLIC_DIR, filePath);
  try {
    const content = await readFile(abs);
    const ext = extname(abs);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
