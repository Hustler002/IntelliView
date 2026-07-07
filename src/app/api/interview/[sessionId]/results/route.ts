import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";
import Answer from "@/lib/db/models/Answer";
import Evaluation from "@/lib/db/models/Evaluation";
import JobDescription from "@/lib/db/models/JobDescription";
import { aggregateScores, generateScoreSummary } from "@/lib/scoring";

/**
 * GET /api/interview/[sessionId]/results
 *
 * Returns full results data for a completed session:
 *   - Session metadata (JD role, date, status)
 *   - Overall scores (averages across all dimensions)
 *   - Per-question: question, transcript, scores, feedback
 *   - Cached improvement roadmap (if generated)
 */
export async function GET(
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

    // Fetch related data
    const [questions, answers, evaluations, jd] = await Promise.all([
      Question.find({ sessionId, isRemoved: false }).sort({ order: 1 }),
      Answer.find({ sessionId }),
      Evaluation.find({ sessionId }),
      JobDescription.findById(interviewSession.jobDescriptionId),
    ]);

    // Build lookup maps
    const answerMap = new Map(
      answers.map((a) => [a.questionId.toString(), a])
    );
    const evalMap = new Map(
      evaluations.map((e) => [e.answerId.toString(), e])
    );

    // Per-question breakdown
    const questionsData = questions.map((q) => {
      const answer = answerMap.get(q._id.toString());
      const evaluation = answer
        ? evalMap.get(answer._id.toString())
        : undefined;

      return {
        questionId: q._id.toString(),
        text: q.text,
        type: q.type,
        order: q.order,
        transcript: answer?.transcript || null,
        correctnessScore: evaluation?.correctnessScore || 0,
        communicationScore: evaluation?.communicationScore || 0,
        confidenceScore: evaluation?.confidenceScore || 0,
        feedback: evaluation?.feedback || "Not yet evaluated",
        improvementNotes: evaluation?.improvementNotes || "",
        hasEvaluation: !!evaluation,
      };
    });

    // Aggregate scores
    const validEvals = evaluations.map((e) => ({
      correctnessScore: e.correctnessScore,
      communicationScore: e.communicationScore,
      confidenceScore: e.confidenceScore,
    }));
    const scores = aggregateScores(validEvals);
    const summary = generateScoreSummary(scores);

    // Cache overall score on the session if not already set
    if (!interviewSession.overallScore && scores.overall > 0) {
      await InterviewSession.findByIdAndUpdate(sessionId, {
        overallScore: scores.overall,
      });
    }

    return NextResponse.json({
      session: {
        id: interviewSession._id.toString(),
        status: interviewSession.status,
        createdAt: interviewSession.createdAt,
        completedAt: interviewSession.completedAt,
        resumeProfileId: interviewSession.resumeProfileId.toString(),
        jobDescriptionId: interviewSession.jobDescriptionId.toString(),
      },
      jd: {
        role: jd?.role || "Unknown",
        seniority: jd?.seniority || "Unknown",
      },
      scores,
      summary,
      questions: questionsData,
      improvementRoadmap: interviewSession.improvementRoadmap || null,
    });
  } catch (error) {
    console.error("Results fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch results" },
      { status: 500 }
    );
  }
}
