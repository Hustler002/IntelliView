import { Queue } from "bullmq";

/**
 * BullMQ queue instances shared across Next.js API routes.
 *
 * These queues are used to enqueue async work (resume parsing, JD parsing,
 * question generation, etc.). The actual processing happens in the separate
 * Express worker server (server/src/index.ts).
 *
 * We pass the Redis URL as a connection config object instead of an IORedis
 * instance to avoid version conflicts between our ioredis and BullMQ's
 * bundled ioredis (they ship different versions with incompatible types).
 */

function getConnectionConfig() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(redisUrl);
  const useTls = url.protocol === "rediss:";

  return {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
    ...(useTls ? { tls: {} } : {}), // Upstash and other managed Redis require TLS
  };
}

// Lazy-initialized queue singletons
let _parseResumeQueue: Queue | null = null;
let _parseJDQueue: Queue | null = null;

export function getParseResumeQueue(): Queue {
  if (!_parseResumeQueue) {
    _parseResumeQueue = new Queue("parse-resume", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000, // 2s → 4s → 8s
        },
        removeOnComplete: { count: 100 }, // Keep last 100 completed for debugging
        removeOnFail: { count: 50 },
      },
    });
  }
  return _parseResumeQueue;
}

export function getParseJDQueue(): Queue {
  if (!_parseJDQueue) {
    _parseJDQueue = new Queue("parse-jd", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _parseJDQueue;
}

// ── Generate Questions Queue ─────────────────────────────────────
let _generateQuestionsQueue: Queue | null = null;

export function getGenerateQuestionsQueue(): Queue {
  if (!_generateQuestionsQueue) {
    _generateQuestionsQueue = new Queue("generate-questions", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 3000, // 3s → 6s → 12s (longer for LLM calls)
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _generateQuestionsQueue;
}

// ── Transcribe-Evaluate Queue ────────────────────────────────────
let _transcribeEvaluateQueue: Queue | null = null;

export function getTranscribeEvaluateQueue(): Queue {
  if (!_transcribeEvaluateQueue) {
    _transcribeEvaluateQueue = new Queue("transcribe-evaluate", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s → 10s → 20s (STT + LLM calls are heavy)
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _transcribeEvaluateQueue;
}

// ── Synthesize-Roadmap Queue ─────────────────────────────────────
let _synthesizeRoadmapQueue: Queue | null = null;

export function getSynthesizeRoadmapQueue(): Queue {
  if (!_synthesizeRoadmapQueue) {
    _synthesizeRoadmapQueue = new Queue("synthesize-roadmap", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 3000, // 3s → 6s → 12s (single LLM call)
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _synthesizeRoadmapQueue;
}

/**
 * All queue names in the system. Used by the admin jobs page
 * to enumerate and query job status across all queues.
 */
export const ALL_QUEUE_NAMES = [
  "parse-resume",
  "parse-jd",
  "generate-questions",
  "transcribe-evaluate",
  "synthesize-roadmap",
] as const;

export type QueueName = (typeof ALL_QUEUE_NAMES)[number];
