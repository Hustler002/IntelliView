import { z } from "zod";

/**
 * Zod schema for validating the LLM's question generation response.
 *
 * The LLM is instructed to return an array of exactly 10 question objects.
 * Each object must have a type (hr/technical/behavioral), the question text,
 * and a rationale for why this question was chosen.
 *
 * Exported separately from the worker so it can be unit-tested in isolation.
 */

/**
 * Normalizes LLM type output to our strict enum.
 * LLMs commonly return variations like "HR", "Culture-fit", "Technical/Problem-Solving", etc.
 */
function normalizeType(val: unknown): string {
  if (typeof val !== "string") return String(val);
  const lower = val.toLowerCase().trim();
  // Map common LLM variations to canonical types
  if (lower === "hr" || lower.includes("culture") || lower.includes("hr")) return "hr";
  if (lower.includes("technical") || lower.includes("tech")) return "technical";
  if (lower.includes("behavioral") || lower.includes("behaviour") || lower.includes("star")) return "behavioral";
  return lower; // fallback — will fail Zod enum if truly unknown
}

const QuestionItemSchema = z.object({
  type: z.preprocess(
    normalizeType,
    z.enum(["hr", "technical", "behavioral"], {
      errorMap: () => ({
        message:
          'Question type must be "hr", "technical", or "behavioral"',
      }),
    })
  ),
  text: z
    .string()
    .min(10, "Question text must be at least 10 characters"),
  rationale: z
    .string()
    .min(5, "Rationale must be at least 5 characters"),
});

export type QuestionItem = z.infer<typeof QuestionItemSchema>;

/**
 * The top-level schema: an array of exactly 10 questions.
 *
 * We accept 8-12 to give the LLM slight wiggle room, but the system prompt
 * asks for exactly 10. If the count is outside this range, validation fails.
 */
export const QuestionResponseSchema = z
  .array(QuestionItemSchema)
  .min(8, "Expected at least 8 questions")
  .max(12, "Expected at most 12 questions");

export type QuestionResponse = z.infer<typeof QuestionResponseSchema>;

/**
 * Validate a raw LLM response string as a question array.
 *
 * @returns The parsed and validated array on success
 * @throws Error with a descriptive message on failure
 */
export function validateQuestionResponse(raw: string): QuestionResponse {
  // Step 1: Parse as JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Response is not valid JSON: ${raw.slice(0, 200)}...`
    );
  }

  // Step 2: Handle the common case where the LLM wraps the array in an object
  // e.g., { "questions": [...] }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed)
  ) {
    const obj = parsed as Record<string, unknown>;
    // Look for a key that contains an array
    const arrayKey = Object.keys(obj).find((k) =>
      Array.isArray(obj[k])
    );
    if (arrayKey) {
      parsed = obj[arrayKey];
    }
  }

  // Step 3: Validate with Zod
  const result = QuestionResponseSchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Question validation failed: ${issues}`);
  }

  return result.data;
}
