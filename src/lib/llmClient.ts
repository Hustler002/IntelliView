import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * LLM client for use in Next.js API routes (server-side only).
 *
 * This mirrors the server/src/lib/llm.ts pattern but lives in the
 * Next.js src/ directory so it can be imported by API routes without
 * crossing project boundaries.
 *
 * Used for lightweight, inline LLM calls (e.g. roadmap synthesis)
 * that don't need the BullMQ worker pipeline.
 */

type LLMProvider = "openai" | "gemini";

const provider: LLMProvider =
  (process.env.LLM_PROVIDER as LLMProvider) || "openai";

export async function callLLMFromNextJS(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  switch (provider) {
    case "openai":
      return callOpenAI(systemPrompt, userPrompt);
    case "gemini":
      return callGemini(systemPrompt, userPrompt);
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

async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userPrompt);
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty response");
  return text.trim();
}
