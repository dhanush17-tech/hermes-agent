import { describe, expect, it } from "vitest";
import { hashPayload, stableStringify } from "./hash.js";

describe("hashPayload", () => {
  it("stable across key order", () => {
    const a = { b: 2, a: 1, nested: { z: 3, y: 2 } };
    const b = { a: 1, nested: { y: 2, z: 3 }, b: 2 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it("differs when payload changes", () => {
    expect(hashPayload({ x: 1 })).not.toBe(hashPayload({ x: 2 }));
  });
});
