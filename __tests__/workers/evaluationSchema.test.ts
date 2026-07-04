import { describe, it, expect } from "vitest";

/**
 * Tests for the evaluation LLM response schema validation.
 *
 * Same pattern as questionSchema.test.ts — validates that the Zod schema
 * correctly accepts valid evaluations and rejects malformed ones.
 */

import {
  validateEvaluationResponse,
  EvaluationResultSchema,
} from "../../server/src/lib/evaluationSchema";

// ── Valid Responses ──────────────────────────────────────────────

describe("EvaluationResultSchema", () => {
  it("accepts a valid evaluation result", () => {
    const valid = {
      correctnessScore: 7,
      communicationScore: 8,
      feedback:
        "The candidate demonstrated solid understanding of database normalization principles and correctly identified the need for indexing.",
      improvement:
        "Quantify the performance improvement you achieved — mention specific query time reductions.",
    };

    const result = EvaluationResultSchema.parse(valid);
    expect(result.correctnessScore).toBe(7);
    expect(result.communicationScore).toBe(8);
  });

  it("accepts minimum valid scores (1)", () => {
    const result = EvaluationResultSchema.parse({
      correctnessScore: 1,
      communicationScore: 1,
      feedback: "The answer was largely off-topic and did not address the question asked.",
      improvement: "Review the fundamentals of REST API design before your next attempt.",
    });

    expect(result.correctnessScore).toBe(1);
  });

  it("accepts maximum valid scores (10)", () => {
    const result = EvaluationResultSchema.parse({
      correctnessScore: 10,
      communicationScore: 10,
      feedback:
        "Excellent answer. The candidate covered all key points with specific examples from their experience.",
      improvement:
        "Consider mentioning the trade-offs of your approach to show deeper understanding.",
    });

    expect(result.correctnessScore).toBe(10);
  });
});

// ── Invalid Scores ───────────────────────────────────────────────

describe("EvaluationResultSchema — score validation", () => {
  it("rejects correctnessScore of 0 (below minimum)", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 0,
        communicationScore: 5,
        feedback: "Some substantive feedback here about the answer.",
        improvement: "Practice explaining your approach step by step.",
      })
    ).toThrow();
  });

  it("rejects communicationScore of 11 (above maximum)", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 5,
        communicationScore: 11,
        feedback: "Some substantive feedback here about the answer.",
        improvement: "Practice explaining your approach step by step.",
      })
    ).toThrow();
  });

  it("rejects non-integer scores", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7.5,
        communicationScore: 8,
        feedback: "Some substantive feedback here about the answer.",
        improvement: "Practice explaining your approach step by step.",
      })
    ).toThrow();
  });
});

// ── Missing Fields ───────────────────────────────────────────────

describe("EvaluationResultSchema — required fields", () => {
  it("rejects missing feedback", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 8,
        improvement: "Practice explaining your approach step by step.",
      })
    ).toThrow();
  });

  it("rejects missing improvement", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 8,
        feedback: "Some substantive feedback here about the answer.",
      })
    ).toThrow();
  });

  it("rejects empty feedback (too short)", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 8,
        feedback: "Good job.",
        improvement: "Practice explaining your approach step by step.",
      })
    ).toThrow();
  });
});

// ── validateEvaluationResponse (JSON parsing + unwrapping) ───────

describe("validateEvaluationResponse", () => {
  it("parses valid JSON evaluation", () => {
    const json = JSON.stringify({
      correctnessScore: 8,
      communicationScore: 7,
      feedback:
        "The candidate showed strong knowledge of React hooks and correctly explained the useState lifecycle.",
      improvement:
        "Add a concrete example of a bug you fixed using useEffect cleanup to make the answer more memorable.",
    });

    const result = validateEvaluationResponse(json);
    expect(result.correctnessScore).toBe(8);
    expect(result.communicationScore).toBe(7);
  });

  it("unwraps LLM response nested in an object", () => {
    // LLMs sometimes wrap: { "evaluation": { ... } }
    const json = JSON.stringify({
      evaluation: {
        correctnessScore: 6,
        communicationScore: 9,
        feedback:
          "Good technical depth but missed the concurrency aspect of the problem.",
        improvement:
          "Study mutex vs semaphore patterns for the concurrent access scenario described.",
      },
    });

    const result = validateEvaluationResponse(json);
    expect(result.correctnessScore).toBe(6);
    expect(result.communicationScore).toBe(9);
  });

  it("unwraps when nested under arbitrary key name", () => {
    const json = JSON.stringify({
      result: {
        correctnessScore: 5,
        communicationScore: 4,
        feedback:
          "The answer was vague and did not demonstrate hands-on experience with the technology.",
        improvement:
          "Prepare a specific project example that uses Docker in a CI/CD pipeline.",
      },
    });

    const result = validateEvaluationResponse(json);
    expect(result.correctnessScore).toBe(5);
  });

  it("throws on completely invalid JSON", () => {
    expect(() =>
      validateEvaluationResponse("I'm sorry, I can't evaluate that.")
    ).toThrow("not valid JSON");
  });

  it("throws on JSON array instead of object", () => {
    expect(() => validateEvaluationResponse("[1, 2, 3]")).toThrow(
      "Expected a JSON object"
    );
  });

  it("throws on valid JSON but wrong shape", () => {
    const json = JSON.stringify({
      score: 8,
      comment: "Good answer",
    });

    expect(() => validateEvaluationResponse(json)).toThrow(
      "validation failed"
    );
  });

  it("handles extra fields gracefully (strips them)", () => {
    const json = JSON.stringify({
      correctnessScore: 7,
      communicationScore: 8,
      feedback:
        "Good explanation of the trade-offs involved in choosing between SQL and NoSQL.",
      improvement:
        "Mention specific query patterns that favor each database type.",
      confidenceEstimate: 0.85, // Extra field from LLM
      reasoning: "The candidate showed...", // Extra field
    });

    const result = validateEvaluationResponse(json);
    expect(result.correctnessScore).toBe(7);
    expect(result).not.toHaveProperty("confidenceEstimate");
    expect(result).not.toHaveProperty("reasoning");
  });
});
