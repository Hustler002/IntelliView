import { z } from "zod";

/**
 * Zod schema for validating the LLM's answer evaluation response.
 *
 * The LLM is instructed to return a JSON object with four fields:
 *   correctnessScore (1-10), communicationScore (1-10),
 *   feedback (2-3 sentences), improvement (one actionable step).
 *
 * Exported separately from the worker so it can be unit-tested in isolation.
 * Same validation pattern as questionSchema.ts.
 */

export const EvaluationResultSchema = z.object({
  correctnessScore: z
    .number()
    .int("Correctness score must be a whole number")
    .min(1, "Correctness score must be at least 1")
    .max(10, "Correctness score must be at most 10"),
  communicationScore: z
    .number()
    .int("Communication score must be a whole number")
    .min(1, "Communication score must be at least 1")
    .max(10, "Communication score must be at most 10"),
  feedback: z
    .string()
    .min(20, "Feedback must be substantive — at least 20 characters"),
  improvement: z
    .string()
    .min(10, "Improvement note must be at least 10 characters"),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Validate a raw LLM response string as an evaluation result.
 *
 * Handles the common case where the LLM wraps the result in an object
 * (e.g., { "evaluation": { ... } }) by looking for a nested object that
 * matches the expected shape.
 *
 * @returns The parsed and validated evaluation on success
 * @throws Error with a descriptive message on failure
 */
export function validateEvaluationResponse(raw: string): EvaluationResult {
  // Step 1: Parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Evaluation response is not valid JSON: ${raw.slice(0, 200)}...`
    );
  }

  // Step 2: If it's an object, try to validate it directly first
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const directResult = EvaluationResultSchema.safeParse(parsed);
    if (directResult.success) {
      return directResult.data;
    }

    // If direct validation failed, look for a nested object that might work.
    // LLMs sometimes wrap the response: { "evaluation": { ... } }
    const obj = parsed as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
        const nestedResult = EvaluationResultSchema.safeParse(obj[key]);
        if (nestedResult.success) {
          return nestedResult.data;
        }
      }
    }

    // Neither direct nor nested worked — report the direct validation error
    const issues = directResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Evaluation validation failed: ${issues}`);
  }

  throw new Error(
    `Expected a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`
  );
}
