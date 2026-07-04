import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";
import Answer from "@/lib/db/models/Answer";
import Evaluation from "@/lib/db/models/Evaluation";

/**
 * GET /api/interview/[sessionId]/progress
 *
 * Returns per-question evaluation progress for the processing screen.
 * Used by polling to show which answers are transcribed/evaluated/done.
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

    // Verify session ownership
    const interviewSession = await InterviewSession.findById(sessionId);
    if (!interviewSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch questions with their answer and evaluation status
    const questions = await Question.find({
      sessionId,
      isRemoved: false,
    }).sort({ order: 1 });

    const answers = await Answer.find({ sessionId });
    const evaluations = await Evaluation.find({ sessionId });

    // Build a map for efficient lookup
    const answerMap = new Map(
      answers.map((a) => [a.questionId.toString(), a])
    );
    const evalMap = new Map(
      evaluations.map((e) => [e.answerId.toString(), e])
    );

    const questionsProgress = questions.map((q) => {
      const answer = answerMap.get(q._id.toString());
      const evaluation = answer
        ? evalMap.get(answer._id.toString())
        : undefined;

      return {
        questionId: q._id.toString(),
        questionText: q.text,
        questionType: q.type,
        order: q.order,
        answerStatus: answer?.status || "pending",
        hasEvaluation: !!evaluation,
        failureReason: answer?.failureReason || null,
      };
    });

    // Count completed evaluations
    const completedCount = questionsProgress.filter(
      (q) => q.hasEvaluation
    ).length;
    const failedCount = questionsProgress.filter(
      (q) => q.answerStatus === "failed"
    ).length;

    return NextResponse.json({
      sessionStatus: interviewSession.status,
      totalQuestions: questions.length,
      completedEvaluations: completedCount,
      failedEvaluations: failedCount,
      questions: questionsProgress,
    });
  } catch (error) {
    console.error("Progress fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 }
    );
  }
}
