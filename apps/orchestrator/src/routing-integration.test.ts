import { describe, expect, it } from "vitest";
import { wantsBrowserControlledService, messageNeedsLaptopControl } from "./routing-helpers.js";

describe("routing helpers", () => {
  it("does not force browser for plain email checks", () => {
    expect(wantsBrowserControlledService("check people@devlabs.com emails")).toBe(false);
    expect(messageNeedsLaptopControl("check people@devlabs.com emails")).toBe(false);
  });

  it("allows explicit browser Gmail requests", () => {
    expect(
      wantsBrowserControlledService("open Gmail in Arc and show me the inbox"),
    ).toBe(true);
  });

  it("detects login browser requests", () => {
    expect(
      wantsBrowserControlledService(
        "could you open the browser and login to gmail in Arc",
      ),
    ).toBe(true);
  });
});
