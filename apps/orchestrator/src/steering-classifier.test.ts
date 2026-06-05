import { describe, expect, it } from "vitest";
import { classifySteeringRelevance } from "./steering-classifier.js";

describe("classifySteeringRelevance", () => {
  it("treats course corrections as related", async () => {
    const goal = "Open Gmail and summarize unread emails";
    expect(await classifySteeringRelevance(goal, "actually focus on emails from Dominik", null)).toBe(
      true,
    );
    expect(await classifySteeringRelevance(goal, "wait, check calendar first", null)).toBe(true);
  });

  it("treats unrelated topics as separate", async () => {
    const goal = "Open Gmail and summarize unread emails";
    expect(await classifySteeringRelevance(goal, "what is the weather in NYC", null)).toBe(false);
    expect(await classifySteeringRelevance(goal, "daily brief", null)).toBe(false);
  });

  it("detects shared context keywords", async () => {
    const goal = "Scan LinkedIn feed for recruiter messages";
    expect(await classifySteeringRelevance(goal, "skip LinkedIn, do Gmail instead", null)).toBe(true);
  });
});
