import { describe, expect, it } from "vitest";
import { wantsBrowserControlledService } from "./orchestrator.ts";

describe("browser-controlled service routing", () => {
  it("detects explicit browser Gmail requests", () => {
    expect(
      wantsBrowserControlledService(
        "could you open the browser and login to the gmail, I have the gmail logged in already",
      ),
    ).toBe(true);
  });

  it("does not force browser mode for plain email checks", () => {
    expect(wantsBrowserControlledService("check if I have important emails pending")).toBe(false);
  });
});
