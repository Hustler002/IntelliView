import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";

/**
 * GET /api/interview/[sessionId]/questions
 *
 * Returns all questions for a session, sorted by order.
 * Auth-gated: only the session owner can access.
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

    // Only allow fetching questions once they're generated
    const validStatuses = [
      "questions_ready",
      "ready",
      "in_progress",
      "evaluating",
      "completed",
    ];
    if (!validStatuses.includes(interviewSession.status)) {
      return NextResponse.json(
        { error: "Questions are not ready yet" },
        { status: 400 }
      );
    }

    const questions = await Question.find({
      sessionId,
      isRemoved: false,
    }).sort({ order: 1 });

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q._id.toString(),
        type: q.type,
        text: q.text,
        order: q.order,
      })),
      sessionStatus: interviewSession.status,
    });
  } catch (error) {
    console.error("Fetch questions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}
