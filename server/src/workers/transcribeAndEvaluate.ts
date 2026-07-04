import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { callLLM } from "../lib/llm";
import { transcribeAudio } from "../lib/stt";
import mongoose from "mongoose";

/**
 * Transcribe-and-Evaluate worker.
 *
 * Pipeline per answer:
 *   1. Generate a pre-signed S3 URL for the audio file (STT needs an accessible URL)
 *   2. Transcribe audio via STT provider (AssemblyAI / Deepgram / mock)
 *   3. Evaluate the transcript via LLM against the question, resume, and JD
 *   4. Create Evaluation record
 *   5. Check if all answers for the session are completed → mark session as "completed"
 */

// ── Zod schema for LLM evaluation output ─────────────────────────

const EvaluationResultSchema = z.object({
  correctnessScore: z.number().int().min(1).max(10),
  communicationScore: z.number().int().min(1).max(10),
  confidenceScore: z.number().int().min(1).max(10),
  feedback: z.string().min(10, "Feedback must be substantive"),
  improvementNotes: z.string().min(10, "Improvement notes must be actionable"),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

// ── LLM System Prompt ────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are an expert interview coach evaluating a candidate's answer to an interview question.

You will receive:
- The question asked
- The question type (HR, technical, or behavioral)
- The candidate's transcript (speech-to-text)
- The candidate's resume skills and experience
- The job description requirements

Evaluate the answer on three dimensions, scoring each 1-10:

1. **correctnessScore** (1-10): How technically/factually accurate is the answer? For HR questions, assess relevance and thoughtfulness. For technical questions, assess accuracy and depth. For behavioral questions, assess the quality of the example and STAR method usage.

2. **communicationScore** (1-10): How clearly was the answer communicated? Consider structure, conciseness, coherence, and whether the answer directly addresses the question.

3. **confidenceScore** (1-10): Based on the transcript's language patterns, assess confidence. Look for hedging language ("I think maybe...", "I'm not sure but..."), filler words, incomplete thoughts, and self-corrections. Note: this is a text-based proxy — a separate audio-feature pipeline may refine this later.

Also provide:
- **feedback**: 2-4 sentences of specific, constructive feedback. Reference concrete parts of their answer. Don't be generic — if they said something good, name it. If something was wrong, explain why.
- **improvementNotes**: 2-3 actionable steps to improve. Be specific: "Practice explaining X using the STAR method" is useful; "improve your answer" is not.

Score guidelines:
- 1-3: Poor — significant gaps or errors
- 4-5: Below average — partial answer, major areas missing
- 6-7: Good — solid answer with room for improvement
- 8-9: Very good — thorough, well-communicated answer
- 10: Exceptional — would impress any interviewer

Return ONLY valid JSON. No markdown, no explanation, no code fences.`;

// ── S3 Client for pre-signed URLs ────────────────────────────────

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || "intelliview-uploads";

async function getPresignedUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour
}

// ── Job Data Interface ───────────────────────────────────────────

interface TranscribeEvaluateJobData {
  answerId: string;
  sessionId: string;
  questionId: string;
  audioUrl: string;
  audioKey: string;
  mimeType: string;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createTranscribeEvaluateWorker(
  connection: IORedis
): Worker<TranscribeEvaluateJobData> {
  const worker = new Worker<TranscribeEvaluateJobData>(
    "transcribe-evaluate",
    async (job: Job<TranscribeEvaluateJobData>) => {
      const { answerId, sessionId, questionId, audioKey } = job.data;

      const Answer = mongoose.model("Answer");
      const Question = mongoose.model("Question");
      const Evaluation = mongoose.model("Evaluation");
      const InterviewSession = mongoose.model("InterviewSession");
      const ResumeProfile = mongoose.model("ResumeProfile");
      const JobDescription = mongoose.model("JobDescription");

      console.log(
        `[TranscribeEvaluate] Processing answer ${answerId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        // ── Step 1: Transcribe ────────────────────────────────────
        await Answer.findByIdAndUpdate(answerId, {
          status: "transcribing",
        });

        // Generate a pre-signed URL for STT (raw S3 URLs aren't publicly accessible)
        const presignedUrl = await getPresignedUrl(audioKey);
        const transcript = await transcribeAudio(presignedUrl);

        // Save transcript
        await Answer.findByIdAndUpdate(answerId, {
          transcript,
          status: "evaluating",
        });

        console.log(
          `[TranscribeEvaluate] ✓ Transcribed answer ${answerId} (${transcript.length} chars)`
        );

        // ── Step 2: Evaluate ──────────────────────────────────────
        const question = await Question.findById(questionId);
        if (!question) throw new Error(`Question ${questionId} not found`);

        const session = await InterviewSession.findById(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found`);

        const resume = await ResumeProfile.findById(session.resumeProfileId);
        const jd = await JobDescription.findById(session.jobDescriptionId);

        // Build the user prompt with all relevant context
        const userPrompt = `
## Question
Type: ${question.type}
Text: ${question.text}

## Candidate's Answer (Transcript)
${transcript}

## Candidate's Resume
Skills: ${resume?.parsedSkills?.join(", ") || "Not available"}
Experience: ${resume?.parsedExperience?.map((e: { title: string; company: string; duration: string }) => `${e.title} at ${e.company} (${e.duration})`).join("; ") || "Not available"}

## Job Description
Role: ${jd?.role || "Not available"}
Seniority: ${jd?.seniority || "Not available"}
Required Skills: ${jd?.requiredSkills?.join(", ") || "Not available"}
Nice-to-Have: ${jd?.niceToHave?.join(", ") || "Not available"}
`.trim();

        const llmResponse = await callLLM(
          EVALUATION_SYSTEM_PROMPT,
          userPrompt
        );

        // Parse and validate with Zod
        let parsed: EvaluationResult;
        try {
          const jsonData = JSON.parse(llmResponse);
          parsed = EvaluationResultSchema.parse(jsonData);
        } catch (parseError) {
          throw new Error(
            `LLM returned malformed evaluation JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }

        // ── Step 3: Store evaluation ──────────────────────────────
        await Evaluation.create({
          answerId,
          sessionId,
          correctnessScore: parsed.correctnessScore,
          communicationScore: parsed.communicationScore,
          confidenceScore: parsed.confidenceScore,
          feedback: parsed.feedback,
          improvementNotes: parsed.improvementNotes,
        });

        await Answer.findByIdAndUpdate(answerId, {
          status: "completed",
        });

        console.log(
          `[TranscribeEvaluate] ✓ Evaluated answer ${answerId} ` +
            `(correctness: ${parsed.correctnessScore}, communication: ${parsed.communicationScore}, confidence: ${parsed.confidenceScore})`
        );

        // ── Step 4: Check session completion ──────────────────────
        await checkSessionCompletion(sessionId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[TranscribeEvaluate] ✗ Answer ${answerId} failed: ${errorMessage}`
        );

        // If this was the last attempt, mark as failed
        if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
          await Answer.findByIdAndUpdate(answerId, {
            status: "failed",
            failureReason: errorMessage,
          });
        }

        throw error; // Re-throw for BullMQ retry
      }
    },
    {
      connection,
      concurrency: 5, // Process up to 5 answers in parallel
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

/**
 * Check if all answers for a session are completed (or failed).
 * If so, mark the session as completed.
 */
async function checkSessionCompletion(sessionId: string): Promise<void> {
  const Answer = mongoose.model("Answer");
  const Question = mongoose.model("Question");
  const InterviewSession = mongoose.model("InterviewSession");

  const totalQuestions = await Question.countDocuments({
    sessionId,
    isRemoved: false,
  });

  const completedAnswers = await Answer.countDocuments({
    sessionId,
    status: "completed",
  });

  const failedAnswers = await Answer.countDocuments({
    sessionId,
    status: "failed",
  });

  const allDone = completedAnswers + failedAnswers >= totalQuestions;

  if (allDone) {
    await InterviewSession.findByIdAndUpdate(sessionId, {
      status: "completed",
      completedAt: new Date(),
    });
    console.log(`[TranscribeEvaluate] Session ${sessionId} → completed`);
  }
}
