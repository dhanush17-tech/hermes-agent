import type {
  ClassifiedIntent,
  IntentClassifierContext,
  IntentClassifierPort,
} from "@hermes-os/shared";
import { fallbackIntent } from "@hermes-os/shared";

export class RouterAgent {
  constructor(private readonly classifier: IntentClassifierPort | null) {}

  async classify(text: string, ctx: IntentClassifierContext = {}): Promise<ClassifiedIntent> {
    if (!this.classifier) {
      return fallbackIntent(
        "Intent classifier unavailable. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.",
      );
    }
    return this.classifier.classify(text, ctx);
  }
}
