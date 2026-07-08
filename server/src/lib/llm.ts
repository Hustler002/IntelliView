import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Provider-selectable LLM client.
 *
 * Reads LLM_PROVIDER env var to select between OpenAI and Google Gemini.
 * Exposes a single function callLLM(systemPrompt, userPrompt) that
 * abstracts away the provider differences.
 *
 * Design decision: we don't use a class/strategy pattern here — a simple
 * switch is more readable and there are only two providers. If we add more,
 * refactor to a strategy map.
 */

type LLMProvider = "openai" | "gemini";

const provider: LLMProvider =
  (process.env.LLM_PROVIDER as LLMProvider) || "openai";

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
 * @throws LLMError if the API call fails or returns no content
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
        return await callGemini(systemPrompt, userPrompt);
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

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const client = getGeminiClient();
  const model = client.getGenerativeModel({
    model: "gemini-2.0-flash-lite",
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
    throw new LLMError("Gemini returned an empty response", "gemini");
  }

  return content;
}

export { provider as currentProvider };
