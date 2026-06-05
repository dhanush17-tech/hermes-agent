import { createServer, type Server } from "node:http";

export type HealthStatus = {
  status: "running" | "stopped";
  scheduler: "running" | "stopped";
  database: "ok" | "error";
  approvalBroker: "ok" | "error";
  notificationCenter: "running" | "stopped";
  uptimeSeconds: number;
};

export type HealthProvider = () => HealthStatus;

export type HealthServerHandle = {
  server: Server;
  port: number;
  stop: () => Promise<void>;
};

export function startHealthServer(
  provider: HealthProvider,
  port = Number(process.env.HERMES_DAEMON_PORT ?? 3850),
): HealthServerHandle {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const health = provider();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health, null, 2));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1");

  return {
    server,
    port,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
