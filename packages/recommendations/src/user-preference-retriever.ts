import type { MemoryService } from "@hermes-os/memory";
import { getProductPersonalizationContext } from "@hermes-os/memory";

export async function retrieveUserPreferences(
  query: string,
  memory: MemoryService,
  category?: string,
) {
  return getProductPersonalizationContext(query, memory, category);
}
