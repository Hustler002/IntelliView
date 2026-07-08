import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Provider-selectable LLM client with automatic model fallback.
 *
 * PERMANENT FIX for free-tier quota exhaustion:
 * Instead of hardcoding a single Gemini model, we maintain a fallback
 * chain. If one model returns 429 (rate limit), we automatically try
 * the next model in the chain. Each model has its own separate quota
 * bucket on Google's free tier, so this effectively multiplies our
 * available daily requests by the number of models in the chain.
 *
 * The fallback chain is configurable via GEMINI_MODEL env var (comma-separated)
 * or uses the default chain below.
 */

type LLMProvider = "openai" | "gemini";

const provider: LLMProvider =
  (process.env.LLM_PROVIDER as LLMProvider) || "openai";

/**
 * Default Gemini model fallback chain.
 *
 * Order: cheapest/fastest first → heavier models as fallback.
 * Each model has its own independent quota bucket on Google's free tier.
 * If GEMINI_MODEL env var is set (comma-separated), that overrides this.
 */
const DEFAULT_GEMINI_FALLBACK_CHAIN = [
  "gemini-2.0-flash-lite",   // Cheapest, highest free-tier limit
  "gemini-2.5-flash-lite",   // Light, separate quota
  "gemini-2.5-flash",        // Mid-tier
  "gemini-2.0-flash",        // Solid fallback
  "gemini-3.5-flash",        // Newest generation
];

function getGeminiFallbackChain(): string[] {
  const envModels = process.env.GEMINI_MODEL;
  if (envModels && envModels.includes(",")) {
    return envModels.split(",").map((m) => m.trim()).filter(Boolean);
  }
  if (envModels) {
    // Single model specified — still add fallbacks after it
    return [envModels, ...DEFAULT_GEMINI_FALLBACK_CHAIN.filter((m) => m !== envModels)];
  }
  return DEFAULT_GEMINI_FALLBACK_CHAIN;
}

// ── OpenAI Client ────────────────────────────────────────────────
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required when LLM_PROVIDER is 'openai'"
      );
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// ── Gemini Client ────────────────────────────────────────────────
let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is required when LLM_PROVIDER is 'gemini'"
      );
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

// ── Rate Limit Detection ─────────────────────────────────────────

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("quota") ||
    msg.includes("RESOURCE_EXHAUSTED")
  );
}

// ── Unified Interface ────────────────────────────────────────────

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/**
 * Call the configured LLM with a system prompt and user prompt.
 * Returns the raw text response.
 *
 * For Gemini: automatically falls back through the model chain
 * if a model returns a 429 rate limit error.
 *
 * @throws LLMError if the API call fails on ALL models or returns no content
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  try {
    switch (provider) {
      case "openai":
        return await callOpenAI(systemPrompt, userPrompt);
      case "gemini":
        return await callGeminiWithFallback(systemPrompt, userPrompt);
      default:
        throw new LLMError(
          `Unknown LLM provider: ${provider}. Set LLM_PROVIDER to 'openai' or 'gemini'.`,
          provider
        );
    }
  } catch (error) {
    if (error instanceof LLMError) throw error;
    throw new LLMError(
      `LLM call failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
      error
    );
  }
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3, // Low temperature for structured data extraction
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new LLMError("OpenAI returned an empty response", "openai");
  }

  return content;
}

/**
 * Gemini call with automatic model fallback.
 *
 * Tries each model in the fallback chain. If a model returns a 429
 * rate limit error, logs a warning and tries the next model. Only
 * throws if ALL models are exhausted.
 */
async function callGeminiWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getGeminiClient();
  const models = getGeminiFallbackChain();
  const errors: string[] = [];

  for (const modelName of models) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\n---\n\n${userPrompt}` },
            ],
          },
        ],
      });

      const content = result.response.text();
      if (!content) {
        throw new Error("Gemini returned an empty response");
      }

      // Log which model succeeded (useful for debugging quota issues)
      console.log(`[LLM] ✓ Gemini call succeeded with model: ${modelName}`);
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (isRateLimitError(error)) {
        console.warn(
          `[LLM] ⚠ Model ${modelName} rate-limited, trying next fallback...`
        );
        errors.push(`${modelName}: rate-limited`);
        continue; // Try next model
      }

      // Non-rate-limit error — don't fallback, throw immediately
      throw new LLMError(
        `LLM call failed: ${errorMsg}`,
        `gemini/${modelName}`,
        error
      );
    }
  }

  // All models exhausted
  throw new LLMError(
    `All Gemini models rate-limited. Tried: ${errors.join("; ")}. ` +
      `Free tier daily quota exhausted across all fallback models. ` +
      `Either wait for quota reset (midnight PT) or add billing to your Google AI Studio project.`,
    "gemini",
  );
}

export { provider as currentProvider };
