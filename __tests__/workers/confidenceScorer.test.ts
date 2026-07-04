import { describe, it, expect } from "vitest";

/**
 * Tests for the heuristic confidence scoring module.
 *
 * These tests verify the individual scoring functions and the combined
 * confidence score calculation. Since this is the one score in the app
 * that isn't an LLM judgment call, the formula needs to be defensible.
 */

// We import the functions by path rather than alias since tests run
// outside Next.js and can't use @/ imports.
import {
  countFillerWords,
  calculateWPM,
  countLongPauses,
  scoreWPM,
  scoreFillerRatio,
  scorePauseFrequency,
  computeConfidenceScore,
  type WordTimestamp,
} from "../../server/src/lib/confidenceScorer";

// ── Filler Word Counter ──────────────────────────────────────────

describe("countFillerWords", () => {
  it("counts basic filler words", () => {
    const transcript = "Um, I think uh the solution would basically involve, you know, a database";
    const count = countFillerWords(transcript);
    // um=1, uh=1, basically=1, you know=1
    expect(count).toBe(4);
  });

  it("returns 0 for a transcript with no fillers", () => {
    const transcript =
      "The solution involves a normalized database schema with proper indexing for query performance";
    expect(countFillerWords(transcript)).toBe(0);
  });

  it("does NOT count 'like' after 'I' (non-filler usage: 'I like React')", () => {
    const transcript = "I like React and I would like to use TypeScript";
    // "I like" and "would like" are both non-filler contexts
    expect(countFillerWords(transcript)).toBe(0);
  });

  it("counts 'like' as filler when used as discourse marker", () => {
    const transcript = "So like the thing is, like, we need to, like, optimize the query";
    // "So like" (no non-filler predecessor), ", like," (comma predecessor), "to, like,"
    // All three "like" instances should be counted as fillers
    expect(countFillerWords(transcript)).toBeGreaterThanOrEqual(2);
  });

  it("does NOT match filler words inside larger words", () => {
    // "likelihood" contains "like", "humming" contains "um"
    const transcript = "The likelihood of a humming sound is actually quite low";
    // Only "actually" should be counted
    expect(countFillerWords(transcript)).toBe(1);
  });

  it("handles case insensitivity", () => {
    const transcript = "UM I think UH basically BASICALLY";
    // um=1, uh=1, basically=2
    expect(countFillerWords(transcript)).toBe(4);
  });

  it("counts multi-word fillers correctly", () => {
    const transcript =
      "I mean, sort of like a, you know, kind of approach";
    // "i mean"=1, "sort of"=1, "you know"=1, "kind of"=1, "like" (after "of") = 1
    expect(countFillerWords(transcript)).toBeGreaterThanOrEqual(4);
  });

  it("handles empty transcript", () => {
    expect(countFillerWords("")).toBe(0);
  });
});

// ── Words Per Minute ─────────────────────────────────────────────

describe("calculateWPM", () => {
  it("calculates normal speaking pace", () => {
    // 140 words in 60 seconds = 140 WPM
    const words = Array(140).fill("word").join(" ");
    expect(calculateWPM(words, 60)).toBeCloseTo(140, 0);
  });

  it("calculates fast speaking pace", () => {
    // 200 words in 60 seconds = 200 WPM
    const words = Array(200).fill("word").join(" ");
    expect(calculateWPM(words, 60)).toBeCloseTo(200, 0);
  });

  it("returns 0 for zero duration (avoids division by zero)", () => {
    expect(calculateWPM("some words here", 0)).toBe(0);
  });

  it("returns 0 for negative duration", () => {
    expect(calculateWPM("some words", -5)).toBe(0);
  });

  it("handles empty transcript", () => {
    expect(calculateWPM("", 60)).toBe(0);
  });

  it("handles 30-second answer", () => {
    // 50 words in 30 seconds = 100 WPM
    const words = Array(50).fill("word").join(" ");
    expect(calculateWPM(words, 30)).toBeCloseTo(100, 0);
  });
});

// ── Long Pause Counter ───────────────────────────────────────────

describe("countLongPauses", () => {
  it("counts pauses longer than 2 seconds", () => {
    const words: WordTimestamp[] = [
      { text: "I", start: 0, end: 0.3 },
      { text: "think", start: 0.4, end: 0.8 },
      // 3-second gap here (long pause)
      { text: "the", start: 3.8, end: 4.0 },
      { text: "answer", start: 4.1, end: 4.5 },
      // 2.5-second gap (long pause)
      { text: "is", start: 7.0, end: 7.2 },
    ];
    expect(countLongPauses(words)).toBe(2);
  });

  it("returns 0 for no long pauses", () => {
    const words: WordTimestamp[] = [
      { text: "I", start: 0, end: 0.3 },
      { text: "think", start: 0.5, end: 0.8 },
      { text: "so", start: 1.0, end: 1.2 },
    ];
    expect(countLongPauses(words)).toBe(0);
  });

  it("returns 0 when no timestamps provided", () => {
    expect(countLongPauses(undefined)).toBe(0);
  });

  it("returns 0 for single word", () => {
    expect(countLongPauses([{ text: "yes", start: 0, end: 0.5 }])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(countLongPauses([])).toBe(0);
  });

  it("does not count exactly 2-second gaps as long pauses", () => {
    // Gap must be > 2.0, not >= 2.0
    const words: WordTimestamp[] = [
      { text: "I", start: 0, end: 0.5 },
      { text: "think", start: 2.5, end: 3.0 }, // exactly 2.0s gap
    ];
    expect(countLongPauses(words)).toBe(0);
  });
});

// ── WPM Scoring ──────────────────────────────────────────────────

describe("scoreWPM", () => {
  it("gives perfect score (10) at optimal pace (140 WPM)", () => {
    expect(scoreWPM(140)).toBeCloseTo(10, 1);
  });

  it("penalizes very slow speech (60 WPM)", () => {
    const score = scoreWPM(60);
    expect(score).toBeLessThan(4);
    expect(score).toBeGreaterThan(0);
  });

  it("penalizes very fast speech (220 WPM)", () => {
    const score = scoreWPM(220);
    expect(score).toBeLessThan(4);
    expect(score).toBeGreaterThan(0);
  });

  it("gives moderate score at 100 WPM", () => {
    const score = scoreWPM(100);
    expect(score).toBeGreaterThan(5);
    expect(score).toBeLessThan(10);
  });

  it("returns 0 for 0 WPM", () => {
    expect(scoreWPM(0)).toBe(0);
  });
});

// ── Filler Ratio Scoring ─────────────────────────────────────────

describe("scoreFillerRatio", () => {
  it("gives perfect score with no fillers", () => {
    expect(scoreFillerRatio(0, 100)).toBe(10);
  });

  it("gives good score at 2% filler ratio", () => {
    // 2 fillers in 100 words = 2%
    expect(scoreFillerRatio(2, 100)).toBe(8);
  });

  it("gives moderate score at 5% filler ratio", () => {
    expect(scoreFillerRatio(5, 100)).toBe(5);
  });

  it("gives zero score at 10%+ filler ratio", () => {
    expect(scoreFillerRatio(10, 100)).toBe(0);
  });

  it("handles zero total words gracefully", () => {
    expect(scoreFillerRatio(0, 0)).toBe(10);
  });
});

// ── Pause Frequency Scoring ──────────────────────────────────────

describe("scorePauseFrequency", () => {
  it("gives perfect score with no pauses", () => {
    expect(scorePauseFrequency(0, 60)).toBe(10);
  });

  it("gives moderate score at 2 pauses/minute", () => {
    // 2 pauses in 60 seconds = 2 pauses/min → score = 10 - 4 = 6
    expect(scorePauseFrequency(2, 60)).toBe(6);
  });

  it("gives zero score at 5+ pauses/minute", () => {
    expect(scorePauseFrequency(5, 60)).toBe(0);
  });

  it("handles zero duration gracefully", () => {
    expect(scorePauseFrequency(0, 0)).toBe(10);
  });
});

// ── Combined Confidence Score ────────────────────────────────────

describe("computeConfidenceScore", () => {
  it("gives high score for ideal answer", () => {
    const result = computeConfidenceScore({
      transcript:
        "The solution involves implementing a normalized relational database schema with proper indexing on frequently queried columns. I would use PostgreSQL for this use case because of its strong support for complex queries and ACID compliance. The primary optimization would be adding a composite index on the user ID and timestamp columns to support the dashboard query pattern.",
      durationSeconds: 30,
      words: [
        // Simulate even-paced words with no long pauses
        ...Array(50)
          .fill(null)
          .map((_, i) => ({
            text: "word",
            start: i * 0.6,
            end: i * 0.6 + 0.4,
          })),
      ],
    });

    expect(result.confidenceScore).toBeGreaterThanOrEqual(7);
    expect(result.confidenceScore).toBeLessThanOrEqual(10);
  });

  it("gives lower score for hesitant answer with fillers", () => {
    const result = computeConfidenceScore({
      transcript:
        "Um so basically uh I think you know the um solution would be uh sort of like a um database thing basically um yeah",
      durationSeconds: 30,
    });

    expect(result.confidenceScore).toBeLessThan(7);
    expect(result.metrics.fillerCount).toBeGreaterThan(5);
  });

  it("always returns score between 1 and 10", () => {
    // Extreme case: lots of fillers, bad pace
    const worst = computeConfidenceScore({
      transcript: "um uh um uh um uh um uh um uh",
      durationSeconds: 3,
    });
    expect(worst.confidenceScore).toBeGreaterThanOrEqual(1);
    expect(worst.confidenceScore).toBeLessThanOrEqual(10);

    // Extreme case: empty-ish transcript
    const minimal = computeConfidenceScore({
      transcript: "yes",
      durationSeconds: 60,
    });
    expect(minimal.confidenceScore).toBeGreaterThanOrEqual(1);
    expect(minimal.confidenceScore).toBeLessThanOrEqual(10);
  });

  it("returns breakdown with all sub-scores", () => {
    const result = computeConfidenceScore({
      transcript: "I think the answer involves a combination of caching and indexing strategies",
      durationSeconds: 10,
    });

    expect(result).toHaveProperty("confidenceScore");
    expect(result).toHaveProperty("wpmScore");
    expect(result).toHaveProperty("fillerScore");
    expect(result).toHaveProperty("pauseScore");
    expect(result).toHaveProperty("metrics");
    expect(result.metrics).toHaveProperty("wpm");
    expect(result.metrics).toHaveProperty("fillerCount");
    expect(result.metrics).toHaveProperty("fillerRatio");
    expect(result.metrics).toHaveProperty("longPauseCount");
    expect(result.metrics).toHaveProperty("totalWords");
  });

  it("handles answer with long pauses", () => {
    const result = computeConfidenceScore({
      transcript: "So the answer is to use a cache with a TTL of thirty seconds for frequently accessed data",
      durationSeconds: 45,
      words: [
        { text: "So", start: 0, end: 0.3 },
        { text: "the", start: 0.4, end: 0.6 },
        { text: "answer", start: 0.7, end: 1.0 },
        // 5-second pause
        { text: "is", start: 6.0, end: 6.2 },
        { text: "to", start: 6.3, end: 6.4 },
        { text: "use", start: 6.5, end: 6.7 },
        // 4-second pause
        { text: "a", start: 10.7, end: 10.8 },
        { text: "cache", start: 10.9, end: 11.3 },
        // 3-second pause
        { text: "with", start: 14.3, end: 14.5 },
        { text: "a", start: 14.6, end: 14.7 },
        { text: "TTL", start: 14.8, end: 15.2 },
        { text: "of", start: 15.3, end: 15.4 },
        { text: "thirty", start: 15.5, end: 15.8 },
        { text: "seconds", start: 15.9, end: 16.4 },
        { text: "for", start: 16.5, end: 16.7 },
        { text: "frequently", start: 16.8, end: 17.3 },
        { text: "accessed", start: 17.4, end: 17.8 },
        { text: "data", start: 17.9, end: 18.2 },
      ],
    });

    expect(result.metrics.longPauseCount).toBe(3);
    expect(result.pauseScore).toBeLessThan(8); // Penalized for pauses
  });
});
