import { describe, it, expect } from "vitest";
import {
  validateQuestionResponse,
  QuestionResponse,
} from "../../server/src/lib/questionSchema";

/**
 * Unit tests for the validateQuestionResponse function.
 *
 * This function gates LLM output before it's written to Mongo —
 * these tests verify that malformed responses are rejected with
 * clear error messages, and valid edge cases are accepted.
 */

// ── Helpers ────────────────────────────────────────────────────────

/** Build a single valid question object. */
function makeQuestion(
  overrides: Partial<{ type: string; text: string; rationale: string }> = {}
) {
  return {
    type: overrides.type ?? "technical",
    text:
      overrides.text ??
      "Explain how you would design a distributed caching layer for this system.",
    rationale:
      overrides.rationale ??
      "Tests system design depth relevant to the JD's infrastructure requirements.",
  };
}

/** Build a valid 10-question array (the expected LLM output). */
function makeValidResponse(count = 10): object[] {
  const types = ["hr", "hr", "hr", "technical", "technical", "technical", "technical", "behavioral", "behavioral", "behavioral"];
  return Array.from({ length: count }, (_, i) =>
    makeQuestion({ type: types[i % types.length] })
  );
}

// ── Happy Path ─────────────────────────────────────────────────────

describe("validateQuestionResponse — valid inputs", () => {
  it("accepts a valid 10-question JSON array", () => {
    const raw = JSON.stringify(makeValidResponse(10));
    const result = validateQuestionResponse(raw);

    expect(result).toHaveLength(10);
    expect(result[0]).toHaveProperty("type");
    expect(result[0]).toHaveProperty("text");
    expect(result[0]).toHaveProperty("rationale");
  });

  it("accepts 8 questions (lower bound)", () => {
    const raw = JSON.stringify(makeValidResponse(8));
    const result = validateQuestionResponse(raw);
    expect(result).toHaveLength(8);
  });

  it("accepts 12 questions (upper bound)", () => {
    const raw = JSON.stringify(makeValidResponse(12));
    const result = validateQuestionResponse(raw);
    expect(result).toHaveLength(12);
  });

  it('extracts the array from a { "questions": [...] } wrapper', () => {
    const wrapped = JSON.stringify({ questions: makeValidResponse(10) });
    const result = validateQuestionResponse(wrapped);
    expect(result).toHaveLength(10);
  });

  it("extracts the array from any single-key object wrapper", () => {
    const wrapped = JSON.stringify({ interview_questions: makeValidResponse(10) });
    const result = validateQuestionResponse(wrapped);
    expect(result).toHaveLength(10);
  });
});

// ── Malformed Response Fixtures ────────────────────────────────────

describe("validateQuestionResponse — malformed responses", () => {
  it("rejects completely invalid JSON", () => {
    const raw = "I'm sorry, I can't generate questions right now.";
    expect(() => validateQuestionResponse(raw)).toThrow("not valid JSON");
  });

  it("rejects a non-array root with no extractable array", () => {
    const raw = JSON.stringify({ message: "Here are your questions", count: 10 });
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects an empty array", () => {
    const raw = JSON.stringify([]);
    expect(() => validateQuestionResponse(raw)).toThrow("at least 8");
  });

  it("rejects too few questions (7)", () => {
    const raw = JSON.stringify(makeValidResponse(7));
    expect(() => validateQuestionResponse(raw)).toThrow("at least 8");
  });

  it("rejects too many questions (13)", () => {
    const raw = JSON.stringify(makeValidResponse(13));
    expect(() => validateQuestionResponse(raw)).toThrow("at most 12");
  });

  it("rejects a question with missing `type` field", () => {
    const questions = makeValidResponse(10);
    // @ts-expect-error — intentionally removing required field
    delete questions[3].type;
    const raw = JSON.stringify(questions);
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects a question with missing `text` field", () => {
    const questions = makeValidResponse(10);
    // @ts-expect-error — intentionally removing required field
    delete questions[5].text;
    const raw = JSON.stringify(questions);
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects a question with missing `rationale` field", () => {
    const questions = makeValidResponse(10);
    // @ts-expect-error — intentionally removing required field
    delete questions[0].rationale;
    const raw = JSON.stringify(questions);
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects an invalid `type` value", () => {
    const questions = makeValidResponse(10);
    // @ts-expect-error — intentionally setting invalid type
    questions[2].type = "personality";
    const raw = JSON.stringify(questions);
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects a question with text that is too short", () => {
    const questions = makeValidResponse(10);
    // @ts-expect-error — intentionally setting short text
    questions[4].text = "Why?";
    const raw = JSON.stringify(questions);
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects when root is a primitive string", () => {
    const raw = JSON.stringify("just a string");
    expect(() => validateQuestionResponse(raw)).toThrow("validation failed");
  });

  it("rejects JSON with markdown code fences (unparseable)", () => {
    const fenced = "```json\n" + JSON.stringify(makeValidResponse(10)) + "\n```";
    expect(() => validateQuestionResponse(fenced)).toThrow("not valid JSON");
  });
});
