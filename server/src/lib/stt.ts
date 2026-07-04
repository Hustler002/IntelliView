/**
 * Provider-selectable Speech-to-Text client.
 *
 * Reads STT_PROVIDER env var to select between:
 *   - "assemblyai" — AssemblyAI (preferred — returns sentiment metadata)
 *   - "deepgram"   — Deepgram (fast, good for real-time)
 *   - "mock"       — Returns a placeholder transcript (development only)
 *
 * Exposes a single function transcribeAudio(audioUrl) that returns
 * the plain transcript text.
 */

type STTProvider = "assemblyai" | "deepgram" | "mock";

const provider: STTProvider =
  (process.env.STT_PROVIDER as STTProvider) || "mock";

export class STTError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "STTError";
  }
}

/**
 * Transcribe audio from a URL (S3 pre-signed or public).
 *
 * @param audioUrl — accessible URL to the audio file
 * @returns Plain text transcript
 * @throws STTError if transcription fails
 */
export async function transcribeAudio(audioUrl: string): Promise<string> {
  try {
    switch (provider) {
      case "assemblyai":
        return await transcribeWithAssemblyAI(audioUrl);
      case "deepgram":
        return await transcribeWithDeepgram(audioUrl);
      case "mock":
        return await transcribeWithMock();
      default:
        throw new STTError(
          `Unknown STT provider: ${provider}. Set STT_PROVIDER to 'assemblyai', 'deepgram', or 'mock'.`,
          provider
        );
    }
  } catch (error) {
    if (error instanceof STTError) throw error;
    throw new STTError(
      `Transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
      error
    );
  }
}

// ── AssemblyAI ───────────────────────────────────────────────────

async function transcribeWithAssemblyAI(audioUrl: string): Promise<string> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new STTError(
      "ASSEMBLYAI_API_KEY is required when STT_PROVIDER is 'assemblyai'",
      "assemblyai"
    );
  }

  // Step 1: Submit transcription request
  const submitRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: "en",
    }),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text();
    throw new STTError(
      `AssemblyAI submission failed (${submitRes.status}): ${errBody}`,
      "assemblyai"
    );
  }

  const { id: transcriptId } = await submitRes.json();

  // Step 2: Poll for completion (max 60 retries × 3s = 3 minutes)
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pollRes = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      {
        headers: { Authorization: apiKey },
      }
    );

    if (!pollRes.ok) continue;

    const result = await pollRes.json();

    if (result.status === "completed") {
      if (!result.text) {
        throw new STTError(
          "AssemblyAI returned empty transcript",
          "assemblyai"
        );
      }
      return result.text;
    }

    if (result.status === "error") {
      throw new STTError(
        `AssemblyAI transcription error: ${result.error || "Unknown"}`,
        "assemblyai"
      );
    }

    // Still processing — continue polling
  }

  throw new STTError(
    "AssemblyAI transcription timed out after 3 minutes",
    "assemblyai"
  );
}

// ── Deepgram ─────────────────────────────────────────────────────

async function transcribeWithDeepgram(audioUrl: string): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new STTError(
      "DEEPGRAM_API_KEY is required when STT_PROVIDER is 'deepgram'",
      "deepgram"
    );
  }

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&language=en&punctuate=true&smart_format=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: audioUrl }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new STTError(
      `Deepgram request failed (${res.status}): ${errBody}`,
      "deepgram"
    );
  }

  const result = await res.json();
  const transcript =
    result.results?.channels?.[0]?.alternatives?.[0]?.transcript;

  if (!transcript) {
    throw new STTError("Deepgram returned empty transcript", "deepgram");
  }

  return transcript;
}

// ── Mock (Development Only) ──────────────────────────────────────

async function transcribeWithMock(): Promise<string> {
  console.log("[STT/Mock] Using mock transcription — set STT_PROVIDER to 'assemblyai' or 'deepgram' for production");

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return (
    "Thank you for the question. I have experience working with React and TypeScript in production environments. " +
    "In my previous role, I built a component library that was used across three different products. " +
    "I'm particularly strong in state management patterns and have worked with both Redux and Zustand. " +
    "One area I'm actively improving is my understanding of database optimization and query performance."
  );
}

export { provider as currentSTTProvider };
