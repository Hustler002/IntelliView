import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";
import Evaluation from "@/lib/db/models/Evaluation";
import Answer from "@/lib/db/models/Answer";

/**
 * POST /api/interview/[sessionId]/roadmap
 *
 * Triggers the LLM synthesis call to generate the improvement roadmap.
 * Collects all per-question feedback + improvement notes, synthesizes them
 * into 3-5 prioritized action items, and caches the result on the session.
 *
 * The LLM call happens inline (not via BullMQ) because the user is
 * actively waiting on the results page and the call is small (<1s typically).
 */

// ── Roadmap Synthesis System Prompt ──────────────────────────────
//
// Visible in full here, not buried in a string concatenation.
// Follows the same "return strictly valid JSON" pattern as other modules.

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    await connectDB();

    const interviewSession = await InterviewSession.findById(sessionId);
    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Return cached roadmap if already generated
    if (
      interviewSession.improvementRoadmap &&
      interviewSession.improvementRoadmap.length > 0
    ) {
      return NextResponse.json({
        roadmap: interviewSession.improvementRoadmap,
        cached: true,
      });
    }

    // Collect all feedback and improvement notes
    const questions = await Question.find({
      sessionId,
      isRemoved: false,
    }).sort({ order: 1 });

    const answers = await Answer.find({ sessionId });
    const evaluations = await Evaluation.find({ sessionId });

    const answerMap = new Map(
      answers.map((a) => [a.questionId.toString(), a])
    );
    const evalMap = new Map(
      evaluations.map((e) => [e.answerId.toString(), e])
    );

    const feedbackItems = questions
      .map((q) => {
        const answer = answerMap.get(q._id.toString());
        const evaluation = answer
          ? evalMap.get(answer._id.toString())
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
      return NextResponse.json(
        { error: "No evaluations available to synthesize" },
        { status: 400 }
      );
    }

    // Build user prompt with all feedback
    const userPrompt = feedbackItems
      .map(
        (item, i) =>
          `Question ${i + 1} (${item!.type}): "${item!.question}"
Scores: Correctness ${item!.scores.correctness}/10, Communication ${item!.scores.communication}/10, Confidence ${item!.scores.confidence}/10
Feedback: ${item!.feedback}
Improvement: ${item!.improvementNotes}`
      )
      .join("\n\n");

    // Call LLM (using the same server-side LLM utility pattern)
    // Import dynamically to avoid loading LLM client on every API route
    const { callLLMFromNextJS } = await import("@/lib/llmClient");
    const llmResponse = await callLLMFromNextJS(
      ROADMAP_SYSTEM_PROMPT,
      userPrompt
    );

    // Parse response
    let roadmap: string[];
    try {
      const parsed = JSON.parse(llmResponse);
      roadmap = parsed.roadmap;
      if (!Array.isArray(roadmap) || roadmap.length < 3 || roadmap.length > 5) {
        throw new Error(
          `Expected 3-5 roadmap items, got ${Array.isArray(roadmap) ? roadmap.length : typeof roadmap}`
        );
      }
    } catch (parseError) {
      console.error("Roadmap parse error:", parseError, "Raw:", llmResponse);
      return NextResponse.json(
        { error: "Failed to generate roadmap — LLM returned invalid format" },
        { status: 502 }
      );
    }

    // Cache on the session
    await InterviewSession.findByIdAndUpdate(sessionId, {
      improvementRoadmap: roadmap,
    });

    return NextResponse.json({ roadmap, cached: false });
  } catch (error) {
    console.error("Roadmap generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate improvement roadmap" },
      { status: 500 }
    );
  }
}
