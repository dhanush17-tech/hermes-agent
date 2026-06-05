import { describe, expect, it } from "vitest";
import { ConnectorRouter, CONNECTOR_ROUTES } from "./connector-router.js";

describe("ConnectorRouter", () => {
  it("prefers api for gmail when token available", () => {
    const router = new ConnectorRouter({ gmail: ["api"], calendar: ["local_db"] });
    expect(router.route("gmail")).toBe("api");
    expect(router.isStructuredPreferred("gmail")).toBe(true);
  });

  it("falls back to screen when no api", () => {
    const router = new ConnectorRouter({ gmail: ["screen_vision"] });
    expect(router.route("gmail")).toBe("screen_vision");
    expect(router.isStructuredPreferred("gmail")).toBe(false);
  });

  it("defines routes for all major surfaces", () => {
    expect(CONNECTOR_ROUTES.gmail?.[0]).toBe("api");
    expect(CONNECTOR_ROUTES.local_files).toEqual(["local_db"]);
  });
});
