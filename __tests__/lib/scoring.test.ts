import { describe, it, expect } from "vitest";
import {
  aggregateScores,
  getScoreDescriptor,
  generateScoreSummary,
  scoreDelta,
} from "../../src/lib/scoring";

describe("aggregateScores", () => {
  it("calculates averages across multiple evaluations", () => {
    const result = aggregateScores([
      { correctnessScore: 8, communicationScore: 6, confidenceScore: 7 },
      { correctnessScore: 6, communicationScore: 8, confidenceScore: 5 },
    ]);

    expect(result.correctness).toBe(7);
    expect(result.communication).toBe(7);
    expect(result.confidence).toBe(6);
    expect(result.overall).toBe(6.7);
  });

  it("handles a single evaluation", () => {
    const result = aggregateScores([
      { correctnessScore: 9, communicationScore: 8, confidenceScore: 7 },
    ]);

    expect(result.correctness).toBe(9);
    expect(result.communication).toBe(8);
    expect(result.confidence).toBe(7);
    expect(result.overall).toBe(8);
  });

  it("returns zeros for empty evaluations", () => {
    const result = aggregateScores([]);
    expect(result.overall).toBe(0);
    expect(result.correctness).toBe(0);
    expect(result.communication).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it("rounds to one decimal place", () => {
    const result = aggregateScores([
      { correctnessScore: 7, communicationScore: 8, confidenceScore: 6 },
      { correctnessScore: 8, communicationScore: 7, confidenceScore: 9 },
      { correctnessScore: 6, communicationScore: 9, confidenceScore: 5 },
    ]);

    expect(result.correctness).toBe(7);
    expect(result.communication).toBe(8);
    expect(result.confidence).toBe(6.7);
  });
});

describe("getScoreDescriptor", () => {
  it("returns 'Needs work' for scores 1-3", () => {
    expect(getScoreDescriptor(1)).toEqual({ label: "Needs work", tier: "poor" });
    expect(getScoreDescriptor(3)).toEqual({ label: "Needs work", tier: "poor" });
  });

  it("returns 'Below average' for scores 4-5", () => {
    expect(getScoreDescriptor(4)).toEqual({ label: "Below average", tier: "below" });
    expect(getScoreDescriptor(5)).toEqual({ label: "Below average", tier: "below" });
  });

  it("returns 'Good' for scores 6-7", () => {
    expect(getScoreDescriptor(6)).toEqual({ label: "Good", tier: "good" });
    expect(getScoreDescriptor(7)).toEqual({ label: "Good", tier: "good" });
  });

  it("returns 'Very good' for scores 8-9", () => {
    expect(getScoreDescriptor(8)).toEqual({ label: "Very good", tier: "great" });
    expect(getScoreDescriptor(9)).toEqual({ label: "Very good", tier: "great" });
  });

  it("returns 'Exceptional' for score 10", () => {
    expect(getScoreDescriptor(10)).toEqual({
      label: "Exceptional",
      tier: "exceptional",
    });
  });
});

describe("generateScoreSummary", () => {
  it("generates summary with strongest/weakest dimensions", () => {
    const summary = generateScoreSummary({
      overall: 7,
      correctness: 8,
      communication: 7,
      confidence: 6,
    });

    expect(summary).toContain("7/10");
    expect(summary).toContain("good");
  });

  it("handles high scores (8+)", () => {
    const summary = generateScoreSummary({
      overall: 8.5,
      correctness: 9,
      communication: 8,
      confidence: 8.5,
    });

    expect(summary).toContain("8.5/10");
    expect(summary).toContain("very good");
  });

  it("returns placeholder for zero scores", () => {
    const summary = generateScoreSummary({
      overall: 0,
      correctness: 0,
      communication: 0,
      confidence: 0,
    });

    expect(summary).toBe("No scores available yet.");
  });

  it("handles low scores", () => {
    const summary = generateScoreSummary({
      overall: 3,
      correctness: 2,
      communication: 4,
      confidence: 3,
    });

    expect(summary).toContain("3/10");
    expect(summary).toContain("needs work");
  });
});

describe("scoreDelta", () => {
  it("returns positive delta", () => {
    expect(scoreDelta(7.5, 6.3)).toEqual({ text: "+1.2", direction: "up" });
  });

  it("returns negative delta", () => {
    expect(scoreDelta(5, 7)).toEqual({ text: "-2", direction: "down" });
  });

  it("returns same for no change", () => {
    expect(scoreDelta(7, 7)).toEqual({ text: "same", direction: "same" });
  });

  it("returns first attempt when previous is null", () => {
    expect(scoreDelta(7, null)).toEqual({
      text: "first attempt",
      direction: "first",
    });
  });
});
