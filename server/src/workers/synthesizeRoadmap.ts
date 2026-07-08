import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import { callLLM } from "../lib/llm";

/**
 * Synthesize-Roadmap Worker
 *
 * Takes a completed interview session's per-question evaluations and
 * synthesizes them into 3-5 prioritized, actionable improvement items.
 *
 * Concurrency note: This job is safe to run concurrently for different
 * sessions, but only one should run per session (enforced by job data —
 * we only enqueue once per session completion).
 *
 * This worker complements the inline /api/interview/[sessionId]/roadmap
 * endpoint. The API route still works for immediate requests, but this
 * worker can be used for batch/background processing.
 */

// ── LLM System Prompt ────────────────────────────────────────────
// Full prompt visible here for reviewability.

const ROADMAP_SYSTEM_PROMPT = `You are an expert interview coach. You have just reviewed a candidate's full mock interview.

Below are the per-question feedback and improvement notes from each answer.

Synthesize these into EXACTLY 3-5 prioritized, concrete action items. Rules:
- Each item should be specific and actionable ("Practice explaining X using the STAR method")
- Don't repeat or re-list individual notes — synthesize across all of them
- Prioritize by impact: items that would improve the most scores first
- Each item should be 1-2 sentences max
- Focus on patterns (if multiple answers had the same weakness, that's high priority)

Return ONLY valid JSON: { "roadmap": ["item1", "item2", ...] }
No markdown, no code fences, no explanation outside the JSON.`;

// ── Job Data Interface ───────────────────────────────────────────

interface SynthesizeRoadmapJobData {
  sessionId: string;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createSynthesizeRoadmapWorker(
  connection: IORedis
): Worker<SynthesizeRoadmapJobData> {
  const worker = new Worker<SynthesizeRoadmapJobData>(
    "synthesize-roadmap",
    async (job: Job<SynthesizeRoadmapJobData>) => {
      const { sessionId } = job.data;
      const InterviewSession = mongoose.model("InterviewSession");
      const Question = mongoose.model("Question");
      const Answer = mongoose.model("Answer");
      const Evaluation = mongoose.model("Evaluation");

      console.log(
        `[SynthesizeRoadmap] Processing session ${sessionId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        const session = await InterviewSession.findById(sessionId);
        if (!session) {
          throw new Error(`Session ${sessionId} not found`);
        }

        // Skip if roadmap already cached
        if (
          session.improvementRoadmap &&
          session.improvementRoadmap.length > 0
        ) {
          console.log(
            `[SynthesizeRoadmap] Session ${sessionId} already has roadmap — skipping`
          );
          return;
        }

        // Collect all feedback and improvement notes
        const questions = await Question.find({
          sessionId,
          isRemoved: false,
        }).sort({ order: 1 });

        const answers = await Answer.find({ sessionId });
        const evaluations = await Evaluation.find({ sessionId });

        const answerMap = new Map(
          answers.map((a: { questionId: { toString: () => string }; _id: { toString: () => string } }) => [
            a.questionId.toString(),
            a,
          ])
        );
        const evalMap = new Map(
          evaluations.map((e: { answerId: { toString: () => string } }) => [
            e.answerId.toString(),
            e,
          ])
        );

        const feedbackItems = questions
          .map((q: { _id: { toString: () => string }; text: string; type: string }) => {
            const answer = answerMap.get(q._id.toString()) as
              | { _id: { toString: () => string } }
              | undefined;
            const evaluation = answer
              ? (evalMap.get(answer._id.toString()) as {
                  correctnessScore: number;
                  communicationScore: number;
                  confidenceScore: number;
                  feedback: string;
                  improvementNotes: string;
                } | undefined)
              : undefined;
            if (!evaluation) return null;

            return {
              question: q.text,
              type: q.type,
              scores: {
                correctness: evaluation.correctnessScore,
                communication: evaluation.communicationScore,
                confidence: evaluation.confidenceScore,
              },
              feedback: evaluation.feedback,
              improvementNotes: evaluation.improvementNotes,
            };
          })
          .filter(Boolean);

        if (feedbackItems.length === 0) {
          console.warn(
            `[SynthesizeRoadmap] No evaluations for session ${sessionId} — skipping`
          );
          return;
        }

        // Build user prompt
        const userPrompt = feedbackItems
          .map(
            (item: NonNullable<typeof feedbackItems[number]>, i: number) =>
              `Question ${i + 1} (${item.type}): "${item.question}"
Scores: Correctness ${item.scores.correctness}/10, Communication ${item.scores.communication}/10, Confidence ${item.scores.confidence}/10
Feedback: ${item.feedback}
Improvement: ${item.improvementNotes}`
          )
          .join("\n\n");

        // Call LLM
        const llmResponse = await callLLM(ROADMAP_SYSTEM_PROMPT, userPrompt);

        // Parse and validate
        const parsed = JSON.parse(llmResponse);
        const roadmap = parsed.roadmap;

        if (
          !Array.isArray(roadmap) ||
          roadmap.length < 3 ||
          roadmap.length > 5
        ) {
          throw new Error(
            `Expected 3-5 roadmap items, got ${Array.isArray(roadmap) ? roadmap.length : typeof roadmap}`
          );
        }

        // Cache on session
        await InterviewSession.findByIdAndUpdate(sessionId, {
          improvementRoadmap: roadmap,
        });

        console.log(
          `[SynthesizeRoadmap] ✓ Session ${sessionId}: ${roadmap.length} roadmap items generated`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[SynthesizeRoadmap] ✗ Session ${sessionId} failed: ${errorMessage}`
        );
        throw error; // Re-throw for BullMQ retry
      }
    },
    {
      connection,
      concurrency: 2, // Lightweight LLM calls — same concurrency as question generation
    }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[SynthesizeRoadmap] Job ${job?.id} failed permanently:`,
      error.message
    );
  });

  return worker;
}
