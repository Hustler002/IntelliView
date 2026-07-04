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

  return {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
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

// ── Transcribe and Evaluate Queue ────────────────────────────────
let _transcribeEvaluateQueue: Queue | null = null;

export function getTranscribeEvaluateQueue(): Queue {
  if (!_transcribeEvaluateQueue) {
    _transcribeEvaluateQueue = new Queue("transcribe-evaluate", {
      connection: getConnectionConfig(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s → 10s → 20s (STT + LLM calls take time)
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _transcribeEvaluateQueue;
}
