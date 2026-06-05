import { type Server } from "node:http";
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
export declare function startHealthServer(provider: HealthProvider, port?: number): HealthServerHandle;
//# sourceMappingURL=health.d.ts.map