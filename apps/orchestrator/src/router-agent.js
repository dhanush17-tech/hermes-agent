import { fallbackIntent } from "@hermes-os/shared";
export class RouterAgent {
    classifier;
    constructor(classifier) {
        this.classifier = classifier;
    }
    async classify(text, ctx = {}) {
        if (!this.classifier) {
            return fallbackIntent("Intent classifier unavailable. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.");
        }
        return this.classifier.classify(text, ctx);
    }
}
//# sourceMappingURL=router-agent.js.map