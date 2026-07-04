import { AssemblyAI, type Transcript } from "assemblyai";

/**
 * Provider-selectable Speech-to-Text client.
 *
 * Same architectural pattern as llm.ts: reads STT_PROVIDER env var,
 * exposes a single function transcribeAudio(audioUrl) that abstracts
 * away provider differences.
 *
 * Supported providers:
 *   - "assemblyai" (default) — uses AssemblyAI SDK with sentiment analysis
 *   - "deepgram" — uses Deepgram SDK (requires @deepgram/sdk installed)
 *
 * Both providers return word-level timestamps, which are used by the
 * confidence scorer for pause detection.
 */

// ── Types ────────────────────────────────────────────────────────

export interface WordTimestamp {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface SentimentSegment {
  text: string;
  sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  confidence: number;
  start: number;
  end: number;
}

export interface TranscriptionResult {
  transcript: string;
  durationSeconds: number;
  words: WordTimestamp[];
  sentimentSegments: SentimentSegment[];
  /** Full provider response — stored for debugging and future feature extraction */
  rawProviderData: Record<string, unknown>;
}

// ── Errors ───────────────────────────────────────────────────────

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

// ── Provider Selection ───────────────────────────────────────────

type STTProvider = "assemblyai" | "deepgram";

const provider: STTProvider =
  (process.env.STT_PROVIDER as STTProvider) || "assemblyai";

// ── AssemblyAI ───────────────────────────────────────────────────

let assemblyAIClient: AssemblyAI | null = null;

function getAssemblyAIClient(): AssemblyAI {
  if (!assemblyAIClient) {
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new STTError(
        "ASSEMBLYAI_API_KEY is required when STT_PROVIDER is 'assemblyai'",
        "assemblyai"
      );
    }
    assemblyAIClient = new AssemblyAI({ apiKey });
  }
  return assemblyAIClient;
}

async function transcribeWithAssemblyAI(
  audioUrl: string
): Promise<TranscriptionResult> {
  const client = getAssemblyAIClient();

  const transcript: Transcript = await client.transcripts.transcribe({
    audio_url: audioUrl,
    sentiment_analysis: true,
    // Word-level timestamps are included by default in AssemblyAI
  });

  if (transcript.status === "error") {
    throw new STTError(
      `AssemblyAI transcription failed: ${transcript.error}`,
      "assemblyai"
    );
  }

  if (!transcript.text) {
    throw new STTError(
      "AssemblyAI returned an empty transcript — audio may be silent or corrupted",
      "assemblyai"
    );
  }

  // Convert word-level timestamps from milliseconds to seconds
  const words: WordTimestamp[] = (transcript.words ?? []).map((w) => ({
    text: w.text,
    start: w.start / 1000,
    end: w.end / 1000,
  }));

  // Convert sentiment analysis results
  // AssemblyAI types sentiment_analysis as SentimentAnalysisResult[] | boolean | null
  // We only care about the array case — the boolean is returned when the feature is disabled
  const rawSentiment = transcript.sentiment_analysis;
  const sentimentSegments: SentimentSegment[] = (
    Array.isArray(rawSentiment) ? rawSentiment : []
  ).map((s: { text: string; sentiment: SentimentSegment["sentiment"]; confidence: number; start: number; end: number }) => ({
    text: s.text,
    sentiment: s.sentiment,
    confidence: s.confidence,
    start: s.start / 1000,
    end: s.end / 1000,
  }));

  // Duration from the transcript metadata (milliseconds → seconds)
  const durationSeconds = transcript.audio_duration ?? 0;

  return {
    transcript: transcript.text,
    durationSeconds,
    words,
    sentimentSegments,
    rawProviderData: {
      id: transcript.id,
      status: transcript.status,
      audio_duration: transcript.audio_duration,
      confidence: transcript.confidence,
      word_count: words.length,
    },
  };
}

// ── Deepgram ─────────────────────────────────────────────────────
// Stubbed — requires @deepgram/sdk to be installed.
// Follows the same interface so swapping is a one-env-var change.

async function transcribeWithDeepgram(
  audioUrl: string
): Promise<TranscriptionResult> {
  // Dynamic import to avoid requiring the package when not in use
  let createClient: (apiKey: string) => { listen: { prerecorded: { transcribeUrl: (url: { url: string }, options: Record<string, unknown>) => Promise<unknown> } } };
  try {
    // @ts-ignore — @deepgram/sdk is an optional dependency, only required when STT_PROVIDER=deepgram
    const deepgramModule = await import("@deepgram/sdk");
    createClient = (deepgramModule as Record<string, unknown>).createClient as typeof createClient;
  } catch {
    throw new STTError(
      "Deepgram SDK not installed. Run: npm install @deepgram/sdk",
      "deepgram"
    );
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new STTError(
      "DEEPGRAM_API_KEY is required when STT_PROVIDER is 'deepgram'",
      "deepgram"
    );
  }

  const deepgram = createClient(apiKey);

  const response = await deepgram.listen.prerecorded.transcribeUrl(
    { url: audioUrl },
    {
      model: "nova-2",
      smart_format: true,
      utterances: true,
      sentiment: true,
    }
  );

  // Extract from Deepgram's nested response structure
  const result = response as Record<string, unknown>;
  const results = (result.result as Record<string, unknown>)?.results as Record<string, unknown>;
  const channels = results?.channels as Array<Record<string, unknown>>;
  const channel = channels?.[0];
  const alternatives = channel?.alternatives as Array<Record<string, unknown>>;
  const alt = alternatives?.[0];

  if (!alt?.transcript) {
    throw new STTError(
      "Deepgram returned an empty transcript",
      "deepgram"
    );
  }

  const words: WordTimestamp[] = ((alt.words as Array<Record<string, unknown>>) ?? []).map(
    (w) => ({
      text: w.word as string,
      start: w.start as number,
      end: w.end as number,
    })
  );

  const metadata = results?.metadata as Record<string, unknown>;
  const durationSeconds = (metadata?.duration as number) ?? 0;

  // Deepgram sentiment is at the utterance level
  const utterances = results?.utterances as Array<Record<string, unknown>>;
  const sentimentSegments: SentimentSegment[] = (utterances ?? [])
    .filter((u) => u.sentiment)
    .map((u) => ({
      text: u.transcript as string,
      sentiment: (
        (u.sentiment as Record<string, unknown>)?.overall as string
      )?.toUpperCase() as SentimentSegment["sentiment"],
      confidence:
        (u.sentiment as Record<string, unknown>)?.confidence as number ?? 0,
      start: u.start as number,
      end: u.end as number,
    }));

  return {
    transcript: alt.transcript as string,
    durationSeconds,
    words,
    sentimentSegments,
    rawProviderData: {
      provider: "deepgram",
      model: "nova-2",
      duration: durationSeconds,
      word_count: words.length,
    },
  };
}

// ── Unified Interface ────────────────────────────────────────────

/**
 * Transcribe audio from a URL using the configured STT provider.
 *
 * @param audioUrl - A publicly accessible URL to the audio file.
 *                   For S3, use a pre-signed URL with sufficient TTL.
 * @returns Normalized transcription result with word timestamps and sentiment.
 * @throws STTError if the transcription fails or returns empty.
 */
export async function transcribeAudio(
  audioUrl: string
): Promise<TranscriptionResult> {
  try {
    switch (provider) {
      case "assemblyai":
        return await transcribeWithAssemblyAI(audioUrl);
      case "deepgram":
        return await transcribeWithDeepgram(audioUrl);
      default:
        throw new STTError(
          `Unknown STT provider: ${provider}. Set STT_PROVIDER to 'assemblyai' or 'deepgram'.`,
          provider
        );
    }
  } catch (error) {
    if (error instanceof STTError) throw error;
    throw new STTError(
      `STT call failed: ${error instanceof Error ? error.message : String(error)}`,
      provider,
      error
    );
  }
}

export { provider as currentSTTProvider };
