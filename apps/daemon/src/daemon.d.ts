import { type HealthStatus } from "./health.js";
export type DaemonHandle = {
    health: HealthStatus;
    stop: () => Promise<void>;
};
export declare function startDaemon(): Promise<DaemonHandle>;
//# sourceMappingURL=daemon.d.ts.map