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
import { createSynthesizeRoadmapWorker } from "./workers/synthesizeRoadmap";
import { setGenerateQuestionsQueue } from "./lib/sessionStatusUpdater";

// Register Mongoose models before any worker starts processing.
// Uses server-local model definitions (see lib/models.ts for rationale).
import "./lib/models";

/**
 * ── Job Concurrency Model ────────────────────────────────────────
 *
 * Which jobs are safe to run concurrently vs. which must be sequential:
 *
 * SEQUENTIAL (within a single session — enforced by auto-chaining):
 *   parse-resume ─┐
 *                  ├─→ generate-questions ─→ (user answers) ─→ synthesize-roadmap
 *   parse-jd ─────┘
 *
 *   Resume and JD parse can run in parallel with EACH OTHER, but both must
 *   complete before generate-questions starts. This is enforced by
 *   sessionStatusUpdater.ts which only enqueues generate-questions when
 *   both parsers report "parsed" status.
 *
 * CONCURRENT (within a single session):
 *   transcribe-evaluate — different questions in the same session CAN
 *   process in parallel. Each job is scoped to a single (question, answer)
 *   pair and writes to its own Evaluation document. No cross-question
 *   dependencies exist during evaluation.
 *
 * CONCURRENT (across sessions):
 *   ALL job types are safe to run concurrently across different users'
 *   sessions. There are no shared-state conflicts between sessions.
 */

const PORT = parseInt(process.env.WORKER_PORT || "4000", 10);

/** Helper to build a BullMQ-compatible connection config from the Redis URL */
function buildQueueConnection(parsedUrl: URL, useTls: boolean) {
  return {
    host: parsedUrl.hostname || "localhost",
    port: parseInt(parsedUrl.port || "6379", 10),
    password: parsedUrl.password || undefined,
    maxRetriesPerRequest: null as null,
    ...(useTls ? { tls: {} } : {}),
  };
}

async function main() {
  console.log("[Server] Starting IntelliView worker server...");

  // ── Connect to MongoDB ────────────────────────────────────────
  await connectDB();

  // ── Connect to Redis ──────────────────────────────────────────
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const parsedUrl = new URL(redisUrl);
  const useTls = parsedUrl.protocol === "rediss:";

  const redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(useTls ? { tls: {} } : {}),
  });

  console.log("[Server] Connected to Redis");

  const queueConnection = buildQueueConnection(parsedUrl, useTls);

  // ── Create Queues (for auto-chaining between workers) ─────────
  const generateQuestionsQueue = new Queue("generate-questions", {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  setGenerateQuestionsQueue(generateQuestionsQueue);

  const transcribeEvaluateQueue = new Queue("transcribe-evaluate", {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
    },
  });

  const synthesizeRoadmapQueue = new Queue("synthesize-roadmap", {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  // ── Start BullMQ Workers ──────────────────────────────────────
  const resumeWorker = createParseResumeWorker(redisConnection);
  const jdWorker = createParseJDWorker(redisConnection);
  const questionsWorker = createGenerateQuestionsWorker(redisConnection);
  const transcribeEvalWorker = createTranscribeEvaluateWorker(redisConnection);
  const roadmapWorker = createSynthesizeRoadmapWorker(redisConnection);

  console.log(
    "[Server] Workers started: parse-resume, parse-jd, generate-questions, transcribe-evaluate, synthesize-roadmap"
  );

  // ── Express App ───────────────────────────────────────────────
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check — includes worker + queue status
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      workers: {
        parseResume: resumeWorker.isRunning(),
        parseJD: jdWorker.isRunning(),
        generateQuestions: questionsWorker.isRunning(),
        transcribeEvaluate: transcribeEvalWorker.isRunning(),
        synthesizeRoadmap: roadmapWorker.isRunning(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // ── Bull Board (local dev only) ───────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createBullBoard } = await import("@bull-board/api");
      const { BullMQAdapter } = await import("@bull-board/api/bullMQAdapter");
      const { ExpressAdapter } = await import("@bull-board/express");

      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath("/admin/queues");

      // We need Queue instances for the board — create read-only queue references
      // for parse-resume and parse-jd (workers already exist but we need Queue objects)
      const parseResumeQueueForBoard = new Queue("parse-resume", {
        connection: queueConnection,
      });
      const parseJDQueueForBoard = new Queue("parse-jd", {
        connection: queueConnection,
      });

      createBullBoard({
        queues: [
          new BullMQAdapter(parseResumeQueueForBoard),
          new BullMQAdapter(parseJDQueueForBoard),
          new BullMQAdapter(generateQuestionsQueue),
          new BullMQAdapter(transcribeEvaluateQueue),
          new BullMQAdapter(synthesizeRoadmapQueue),
        ],
        serverAdapter,
      });

      app.use("/admin/queues", serverAdapter.getRouter());
      console.log(
        `[Server] Bull Board available at http://localhost:${PORT}/admin/queues`
      );
    } catch {
      console.warn(
        "[Server] Bull Board not available — install @bull-board/express and @bull-board/api for local dev queue monitoring"
      );
    }
  }

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
    await transcribeEvalWorker.close();
    await roadmapWorker.close();
    await generateQuestionsQueue.close();
    await transcribeEvaluateQueue.close();
    await synthesizeRoadmapQueue.close();
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
