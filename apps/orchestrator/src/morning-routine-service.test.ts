import { describe, expect, it } from "vitest";
import { isMorningRoutineQuery } from "./morning-routine-service.js";

describe("isMorningRoutineQuery", () => {
  it("matches explicit morning routine", () => {
    expect(isMorningRoutineQuery("it is a morning routine to check my inbox")).toBe(true);
  });

  it("matches multi-surface daily scan", () => {
    const msg =
      "check my inbox and calendar and canvas and twitter and forecast hindrances for today";
    expect(isMorningRoutineQuery(msg)).toBe(true);
  });

  it("does not match single gmail check", () => {
    expect(isMorningRoutineQuery("check my gmail inbox")).toBe(false);
  });
});
