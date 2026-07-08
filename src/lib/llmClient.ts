import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * LLM client for use in Next.js API routes (server-side only).
 *
 * Mirrors the server/src/lib/llm.ts pattern but lives in the
 * Next.js src/ directory so it can be imported by API routes without
 * crossing project boundaries.
 *
 * Used for lightweight, inline LLM calls (e.g. roadmap synthesis)
 * that don't need the BullMQ worker pipeline.
 *
 * Includes the same automatic model fallback chain as the server-side
 * client to handle free-tier quota exhaustion gracefully.
 */

type LLMProvider = "openai" | "gemini";

const provider: LLMProvider =
  (process.env.LLM_PROVIDER as LLMProvider) || "openai";

/**
 * Default Gemini model fallback chain.
 * Each model has its own independent quota bucket on Google's free tier.
 */
const DEFAULT_GEMINI_FALLBACK_CHAIN = [
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3.5-flash",
];

function getGeminiFallbackChain(): string[] {
  const envModels = process.env.GEMINI_MODEL;
  if (envModels && envModels.includes(",")) {
    return envModels.split(",").map((m) => m.trim()).filter(Boolean);
  }
  if (envModels) {
    return [envModels, ...DEFAULT_GEMINI_FALLBACK_CHAIN.filter((m) => m !== envModels)];
  }
  return DEFAULT_GEMINI_FALLBACK_CHAIN;
}

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("quota") ||
    msg.includes("RESOURCE_EXHAUSTED")
  );
}

export async function callLLMFromNextJS(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAI(systemPrompt, userPrompt);
    case "gemini":
      return callGeminiWithFallback(systemPrompt, userPrompt);
    default:
      throw new Error(
        `Unknown LLM_PROVIDER: ${provider}. Set to 'openai' or 'gemini'.`
      );
  }
}

async function callOpenAI(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");
  return content.trim();
}

/**
 * Gemini call with automatic model fallback.
 * If a model returns 429, automatically tries the next model in the chain.
 */
async function callGeminiWithFallback(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const genAI = new GoogleGenerativeAI(apiKey);
  const models = getGeminiFallbackChain();
  const errors: string[] = [];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent(userPrompt);
      const text = result.response.text();
      if (!text) throw new Error("Gemini returned empty response");

      console.log(`[LLM] ✓ Gemini call succeeded with model: ${modelName}`);
      return text.trim();
    } catch (error) {
      if (isRateLimitError(error)) {
        console.warn(
          `[LLM] ⚠ Model ${modelName} rate-limited, trying next fallback...`
        );
        errors.push(`${modelName}: rate-limited`);
        continue;
      }
      // Non-rate-limit error — throw immediately
      throw error;
    }
  }

  throw new Error(
    `All Gemini models rate-limited. Tried: ${errors.join("; ")}. ` +
      `Wait for quota reset (midnight PT) or add billing to Google AI Studio.`
  );
}
