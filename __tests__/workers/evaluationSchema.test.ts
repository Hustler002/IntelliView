import { describe, it, expect } from "vitest";
import { z } from "zod";

/**
 * Tests for the evaluation Zod schema used by the transcribe-and-evaluate worker.
 *
 * This schema gates the LLM evaluation output — if the LLM returns
 * something malformed, the schema rejects it and the worker retries.
 */

const EvaluationResultSchema = z.object({
  correctnessScore: z.number().int().min(1).max(10),
  communicationScore: z.number().int().min(1).max(10),
  confidenceScore: z.number().int().min(1).max(10),
  feedback: z.string().min(10, "Feedback must be substantive"),
  improvementNotes: z.string().min(10, "Improvement notes must be actionable"),
});

describe("EvaluationResultSchema", () => {
  it("accepts a valid evaluation result", () => {
    const result = EvaluationResultSchema.parse({
      correctnessScore: 7,
      communicationScore: 8,
      confidenceScore: 6,
      feedback:
        "Your answer demonstrated solid knowledge of React hooks, particularly useEffect. You correctly explained the dependency array.",
      improvementNotes:
        "Practice explaining the cleanup function in useEffect using a real-world example like event listeners.",
    });

    expect(result.correctnessScore).toBe(7);
    expect(result.feedback).toContain("React hooks");
  });

  it("rejects scores below 1", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 0,
        communicationScore: 5,
        confidenceScore: 5,
        feedback: "Some feedback here that is long enough",
        improvementNotes: "Some improvement notes that are long enough",
      })
    ).toThrow();
  });

  it("rejects scores above 10", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 11,
        communicationScore: 5,
        confidenceScore: 5,
        feedback: "Some feedback here that is long enough",
        improvementNotes: "Some improvement notes that are long enough",
      })
    ).toThrow();
  });

  it("rejects non-integer scores", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7.5,
        communicationScore: 5,
        confidenceScore: 5,
        feedback: "Some feedback here that is long enough",
        improvementNotes: "Some improvement notes that are long enough",
      })
    ).toThrow();
  });

  it("rejects feedback that is too short", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 5,
        confidenceScore: 5,
        feedback: "Good.", // Too short
        improvementNotes: "Practice more for better results in interviews",
      })
    ).toThrow();
  });

  it("rejects improvementNotes that is too short", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 5,
        confidenceScore: 5,
        feedback: "Your answer was thorough and well-structured overall.",
        improvementNotes: "Do more.", // Too short
      })
    ).toThrow();
  });

  it("rejects missing fields", () => {
    expect(() =>
      EvaluationResultSchema.parse({
        correctnessScore: 7,
        communicationScore: 5,
        // missing confidenceScore, feedback, improvementNotes
      })
    ).toThrow();
  });

  it("strips extra fields from LLM response", () => {
    const result = EvaluationResultSchema.parse({
      correctnessScore: 8,
      communicationScore: 7,
      confidenceScore: 6,
      feedback: "Well-structured answer with good technical depth shown.",
      improvementNotes:
        "Consider using the STAR method more explicitly in your behavioral answers.",
      overallImpression: "strong candidate", // extra
      confidence: 0.95, // extra
    });

    expect(result).not.toHaveProperty("overallImpression");
    expect(result).not.toHaveProperty("confidence");
  });

  it("accepts boundary values (1 and 10)", () => {
    const result = EvaluationResultSchema.parse({
      correctnessScore: 1,
      communicationScore: 10,
      confidenceScore: 1,
      feedback:
        "The answer showed minimal knowledge, but communication was exceptional.",
      improvementNotes:
        "Review fundamentals of distributed systems before your next attempt.",
    });

    expect(result.correctnessScore).toBe(1);
    expect(result.communicationScore).toBe(10);
  });
});
