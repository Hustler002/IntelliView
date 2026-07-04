import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { callLLM } from "../lib/llm";
import { transcribeAudio, type TranscriptionResult } from "../lib/stt";
import { computeConfidenceScore } from "../lib/confidenceScorer";
import { validateEvaluationResponse } from "../lib/evaluationSchema";

// ── LLM System Prompt ────────────────────────────────────────────
// This is the exact prompt sent to the LLM at runtime.
// Visible here for reviewability — not buried in concatenation.

const EVALUATION_SYSTEM_PROMPT = `You are evaluating a candidate's spoken interview answer. You will receive: the original question, its type (hr/technical/behavioral), the transcript of the answer, and the role/seniority context from the job description. Score the answer on two dimensions from 1-10:
- correctness: for technical questions, factual/conceptual accuracy and depth relative to the stated seniority; for hr/behavioral questions, relevance and specificity of the example given
- communication: structure, clarity, and conciseness — STAR structure is a strong signal for behavioral answers; rambling or vague answers score lower regardless of content accuracy
Then write:
- feedback: 2-3 sentences, specific to what was actually said, not generic
- improvement: one concrete, actionable next step (not 'be more confident' — something the candidate can practice, e.g. 'quantify the impact of the project you described')
Return strictly valid JSON with fields: correctnessScore, communicationScore, feedback, improvement. No prose outside the JSON.`;

// ── Retry Suffix ─────────────────────────────────────────────────
// Appended on the second LLM attempt if validation fails.

const STRICT_JSON_REMINDER = `

IMPORTANT: Your previous response was not valid JSON. You MUST return ONLY a valid JSON object. No markdown, no code fences, no explanatory text. Just the raw JSON object starting with { and ending with }.`;

// ── Job Data Interface ───────────────────────────────────────────

interface TranscribeEvaluateJobData {
  answerId: string;
  sessionId: string;
}

// ── S3 Pre-signed URL Generation ─────────────────────────────────
// STT providers need a publicly accessible URL — S3 objects aren't
// public, so we generate a pre-signed URL with a 1-hour TTL.

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET || "intelliview-uploads";

async function getAudioUrl(s3Key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
  });
  // 1-hour TTL — more than enough for transcription to complete
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

// ── User Prompt Assembly ─────────────────────────────────────────

interface EvalPromptContext {
  questionText: string;
  questionType: string;
  transcript: string;
  role: string;
  seniority: string;
}

function assembleEvalUserPrompt(ctx: EvalPromptContext): string {
  return `## Interview Answer Evaluation

**Question Type:** ${ctx.questionType}
**Question:** ${ctx.questionText}

**Role Context:** ${ctx.role} (${ctx.seniority} level)

---

**Candidate's Answer (transcript):**
${ctx.transcript}

---

Evaluate this answer. Return ONLY a JSON object with fields: correctnessScore, communicationScore, feedback, improvement.`;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createTranscribeEvaluateWorker(
  connection: IORedis
): Worker<TranscribeEvaluateJobData> {
  const worker = new Worker<TranscribeEvaluateJobData>(
    "transcribe-evaluate",
    async (job: Job<TranscribeEvaluateJobData>) => {
      const { answerId, sessionId } = job.data;
      const Answer = mongoose.model("Answer");
      const Question = mongoose.model("Question");
      const Evaluation = mongoose.model("Evaluation");
      const InterviewSession = mongoose.model("InterviewSession");
      const JobDescription = mongoose.model("JobDescription");

      console.log(
        `[TranscribeEvaluate] Processing answer ${answerId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        // ── 1. Fetch context ─────────────────────────────────────
        const answer = await Answer.findById(answerId);
        if (!answer) {
          throw new Error(`Answer ${answerId} not found`);
        }

        const question = await Question.findById(answer.questionId);
        if (!question) {
          throw new Error(`Question ${answer.questionId} not found for answer ${answerId}`);
        }

        const session = await InterviewSession.findById(sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }

        const jd = await JobDescription.findById(session.jobDescriptionId).lean();
        if (!jd) {
          throw new Error(`JobDescription ${session.jobDescriptionId} not found`);
        }

        // ── 2. Transcribe ────────────────────────────────────────
        await Answer.findByIdAndUpdate(answerId, { status: "transcribing" });
        console.log(`[TranscribeEvaluate] Answer ${answerId} → transcribing`);

        // Generate a pre-signed URL for the STT provider
        const audioPresignedUrl = await getAudioUrl(answer.audioUrl);
        const sttResult: TranscriptionResult = await transcribeAudio(audioPresignedUrl);

        // Write transcription results to Answer
        await Answer.findByIdAndUpdate(answerId, {
          status: "transcribed",
          transcript: sttResult.transcript,
          durationSeconds: sttResult.durationSeconds,
          sentimentData: {
            segments: sttResult.sentimentSegments,
            providerData: sttResult.rawProviderData,
          },
        });

        console.log(
          `[TranscribeEvaluate] Answer ${answerId} → transcribed ` +
            `(${sttResult.transcript.split(/\s+/).length} words, ${Math.round(sttResult.durationSeconds)}s)`
        );

        // ── 3. Evaluate via LLM ──────────────────────────────────
        await Answer.findByIdAndUpdate(answerId, { status: "evaluating" });

        const userPrompt = assembleEvalUserPrompt({
          questionText: question.text as string,
          questionType: question.type as string,
          transcript: sttResult.transcript,
          role: (jd as Record<string, unknown>).role as string || "Not specified",
          seniority: (jd as Record<string, unknown>).seniority as string || "Not specified",
        });

        // Call LLM with one retry on validation failure (same pattern as generateQuestions)
        let evalResult;
        try {
          const rawResponse = await callLLM(EVALUATION_SYSTEM_PROMPT, userPrompt);

          if (process.env.LOG_RAW_LLM === "true") {
            console.log(`[TranscribeEvaluate] Raw LLM response:\n${rawResponse}`);
          }

          evalResult = validateEvaluationResponse(rawResponse);
        } catch (firstError) {
          console.warn(
            `[TranscribeEvaluate] First LLM attempt failed validation, retrying: ${
              firstError instanceof Error ? firstError.message : String(firstError)
            }`
          );

          const rawResponse = await callLLM(
            EVALUATION_SYSTEM_PROMPT,
            userPrompt + STRICT_JSON_REMINDER
          );

          if (process.env.LOG_RAW_LLM === "true") {
            console.log(`[TranscribeEvaluate] Raw LLM response (retry):\n${rawResponse}`);
          }

          evalResult = validateEvaluationResponse(rawResponse);
        }

        // ── 4. Compute confidence score (heuristic) ──────────────
        const confidenceResult = computeConfidenceScore({
          transcript: sttResult.transcript,
          durationSeconds: sttResult.durationSeconds,
          words: sttResult.words,
        });

        console.log(
          `[TranscribeEvaluate] Answer ${answerId} confidence breakdown: ` +
            `WPM=${confidenceResult.metrics.wpm}, ` +
            `fillers=${confidenceResult.metrics.fillerCount}/${confidenceResult.metrics.totalWords}, ` +
            `pauses=${confidenceResult.metrics.longPauseCount} → ` +
            `score=${confidenceResult.confidenceScore}`
        );

        // ── 5. Write Evaluation ──────────────────────────────────
        // Delete any existing evaluation for this answer (in case of re-run)
        await Evaluation.deleteMany({ answerId });

        await Evaluation.create({
          answerId,
          correctnessScore: evalResult.correctnessScore,
          communicationScore: evalResult.communicationScore,
          confidenceScore: confidenceResult.confidenceScore,
          feedback: evalResult.feedback,
          improvementNotes: evalResult.improvement,
        });

        // Mark answer as fully evaluated
        await Answer.findByIdAndUpdate(answerId, {
          status: "evaluated",
          failureReason: null,
        });

        console.log(
          `[TranscribeEvaluate] ✓ Answer ${answerId}: ` +
            `correctness=${evalResult.correctnessScore}, ` +
            `communication=${evalResult.communicationScore}, ` +
            `confidence=${confidenceResult.confidenceScore}`
        );

        // ── 6. Check session completeness ────────────────────────
        // If all answers in this session are evaluated, mark session as completed.
        const allAnswers = await Answer.find({ sessionId }).lean();
        const allEvaluated = allAnswers.length > 0 &&
          allAnswers.every((a: Record<string, unknown>) => a.status === "evaluated");

        if (allEvaluated) {
          await InterviewSession.findByIdAndUpdate(sessionId, {
            status: "completed",
            completedAt: new Date(),
          });

          console.log(
            `[TranscribeEvaluate] ✓ Session ${sessionId} → completed ` +
              `(${allAnswers.length} answers evaluated)`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[TranscribeEvaluate] ✗ Answer ${answerId} failed: ${errorMessage}`
        );

        // If this was the last attempt, mark answer as permanently failed
        if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
          await Answer.findByIdAndUpdate(answerId, {
            status: "failed",
            failureReason: `Transcription/evaluation failed: ${errorMessage}`,
          });
        }

        throw error; // Re-throw so BullMQ retries if attempts remain
      }
    },
    {
      connection,
      concurrency: 2, // Process up to 2 answers in parallel
    }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[TranscribeEvaluate] Job ${job?.id} failed permanently:`,
      error.message
    );
  });

  return worker;
}
