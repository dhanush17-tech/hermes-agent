import type { ServerResponse } from "node:http";
import { RisksRepository } from "@hermes-os/context-graph";
import type { PersonalOsSystem } from "@hermes-os/orchestrator/system";
export declare function handleControlApi(pathname: string, method: string, system: PersonalOsSystem, risksRepo: RisksRepository, res: ServerResponse): Promise<boolean>;
//# sourceMappingURL=control-api.d.ts.map