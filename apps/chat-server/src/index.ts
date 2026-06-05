import { bootstrapPersonalOs } from "@hermes-os/orchestrator/system";
import { startChatServer } from "./server.js";

const system = bootstrapPersonalOs();
startChatServer(system);
