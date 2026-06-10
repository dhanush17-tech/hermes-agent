import { describe, expect, it } from "vitest";
import { requiresLiveLookup, routingIntentForMessage } from "./live-lookup.js";

describe("live-lookup", () => {
  it("detects price and sale queries", () => {
    expect(requiresLiveLookup("also is the iPhone 17 pro on sale or a price drop?")).toBe(true);
    expect(requiresLiveLookup("how much does it cost")).toBe(true);
    expect(requiresLiveLookup("hey how are you")).toBe(false);
  });

  it("forces research routing for live lookup", () => {
    expect(
      routingIntentForMessage(
        { intent: "unknown", confidence: 0.9, entities: [], routing_hint: "" },
        "is it on sale right now",
      ),
    ).toBe("research");
  });
});
