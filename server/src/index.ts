import "dotenv/config";
import express from "express";
import cors from "cors";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { connectDB } from "./lib/db";
import { createParseResumeWorker } from "./workers/parseResume";
import { createParseJDWorker } from "./workers/parseJD";
import { createGenerateQuestionsWorker } from "./workers/generateQuestions";
import { createTranscribeEvaluateWorker } from "./workers/transcribeAndEvaluate";
import { setGenerateQuestionsQueue } from "./lib/sessionStatusUpdater";

// Register Mongoose models before any worker starts processing.
// Uses server-local model definitions (see lib/models.ts for rationale).
import "./lib/models";

const PORT = parseInt(process.env.WORKER_PORT || "4000", 10);

async function main() {
  console.log("[Server] Starting IntelliView worker server...");

  // ── Connect to MongoDB ────────────────────────────────────────
  await connectDB();

  // ── Connect to Redis ──────────────────────────────────────────
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  console.log("[Server] Connected to Redis");

  // ── Create the generate-questions queue for auto-chaining ─────
  // The sessionStatusUpdater needs this to enqueue question generation
  // jobs after both parsers complete.
  const generateQuestionsQueue = new Queue("generate-questions", {
    connection: {
      host: new URL(redisUrl).hostname || "localhost",
      port: parseInt(new URL(redisUrl).port || "6379", 10),
      password: new URL(redisUrl).password || undefined,
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000, // 3s → 6s → 12s (longer than parsers — LLM calls are heavier)
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  // Wire the queue into the status updater for auto-chaining
  setGenerateQuestionsQueue(generateQuestionsQueue);

  // ── Start BullMQ Workers ──────────────────────────────────────
  const resumeWorker = createParseResumeWorker(redisConnection);
  const jdWorker = createParseJDWorker(redisConnection);
  const questionsWorker = createGenerateQuestionsWorker(redisConnection);
  const transcribeWorker = createTranscribeEvaluateWorker(redisConnection);

  console.log("[Server] Workers started: parse-resume, parse-jd, generate-questions, transcribe-evaluate");

  // ── Express App (health check + future SSE endpoint) ──────────
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      workers: {
        parseResume: resumeWorker.isRunning(),
        parseJD: jdWorker.isRunning(),
        generateQuestions: questionsWorker.isRunning(),
        transcribeEvaluate: transcribeWorker.isRunning(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ── Start HTTP Server ─────────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`[Server] HTTP server running on port ${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/health`);
  });

  // ── Graceful Shutdown ─────────────────────────────────────────
  const shutdown = async () => {
    console.log("[Server] Shutting down...");
    await resumeWorker.close();
    await jdWorker.close();
    await questionsWorker.close();
    await transcribeWorker.close();
    await generateQuestionsQueue.close();
    await redisConnection.quit();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("[Server] Fatal error:", error);
  process.exit(1);
});
