import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for the roadmap LLM output schema.
 * Validates the JSON format returned by the roadmap synthesis call.
 */

const RoadmapSchema = z.object({
  roadmap: z
    .array(z.string().min(10, "Each item must be at least 10 characters"))
    .min(3, "Need at least 3 roadmap items")
    .max(5, "Maximum 5 roadmap items"),
});

describe("RoadmapSchema", () => {
  it("accepts valid 3-item roadmap", () => {
    const result = RoadmapSchema.parse({
      roadmap: [
        "Practice explaining complex technical concepts using analogies to demonstrate communication clarity.",
        "Use the STAR method consistently for behavioral questions — start with a specific situation, not a generalization.",
        "Review fundamentals of system design, particularly load balancing and caching strategies, to improve depth.",
      ],
    });

    expect(result.roadmap).toHaveLength(3);
  });

  it("accepts valid 5-item roadmap", () => {
    const result = RoadmapSchema.parse({
      roadmap: [
        "Focus on providing concrete examples rather than theoretical knowledge in technical answers.",
        "Work on pacing — your answers tend to rush through key points that deserve elaboration.",
        "Practice the STAR method for behavioral questions to give more structured responses.",
        "Study common system design patterns to improve depth on architecture questions.",
        "Build confidence by recording practice sessions and reviewing your delivery.",
      ],
    });

    expect(result.roadmap).toHaveLength(5);
  });

  it("rejects fewer than 3 items", () => {
    expect(() =>
      RoadmapSchema.parse({
        roadmap: [
          "Practice more with mock interviews.",
          "Study system design patterns.",
        ],
      })
    ).toThrow();
  });

  it("rejects more than 5 items", () => {
    expect(() =>
      RoadmapSchema.parse({
        roadmap: [
          "Item one is long enough to pass validation here.",
          "Item two is long enough to pass validation here.",
          "Item three is long enough to pass validation here.",
          "Item four is long enough to pass validation here.",
          "Item five is long enough to pass validation here.",
          "Item six is long enough to pass validation here.",
        ],
      })
    ).toThrow();
  });

  it("rejects items that are too short", () => {
    expect(() =>
      RoadmapSchema.parse({
        roadmap: ["Do more.", "Try harder.", "Be better."],
      })
    ).toThrow();
  });

  it("rejects missing roadmap key", () => {
    expect(() =>
      RoadmapSchema.parse({
        items: ["This is wrong key name used in the response."],
      })
    ).toThrow();
  });

  it("rejects non-array roadmap", () => {
    expect(() =>
      RoadmapSchema.parse({
        roadmap: "This should be an array not a string value.",
      })
    ).toThrow();
  });
});
