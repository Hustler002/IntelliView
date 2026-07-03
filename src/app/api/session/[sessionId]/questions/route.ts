import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";

/**
 * GET /api/session/[sessionId]/questions
 *
 * Returns all questions for a session, sorted by order.
 * Auth-gated: only the session owner can access.
 *
 * Query params:
 *   ?includeRemoved=true — include questions the user has removed
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
    const includeRemoved =
      req.nextUrl.searchParams.get("includeRemoved") === "true";

    await connectDB();

    // Verify session exists and belongs to this user
    const interviewSession = await InterviewSession.findById(sessionId)
      .select("userId status")
      .lean();

    if (!interviewSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Build query
    const query: Record<string, unknown> = { sessionId };
    if (!includeRemoved) {
      query.isRemoved = false;
    }

    const questions = await Question.find(query)
      .sort({ order: 1 })
      .lean();

    return NextResponse.json({
      questions: questions.map((q) => ({
        id: q._id.toString(),
        type: q.type,
        text: q.text,
        rationale: q.rationale,
        order: q.order,
        isRemoved: q.isRemoved,
      })),
      sessionStatus: interviewSession.status,
    });
  } catch (error) {
    console.error("Questions fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/session/[sessionId]/questions
 *
 * Toggles the isRemoved flag on a single question.
 * Body: { questionId: string, isRemoved: boolean }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const body = await req.json();
    const { questionId, isRemoved } = body;

    if (!questionId || typeof isRemoved !== "boolean") {
      return NextResponse.json(
        { error: "questionId (string) and isRemoved (boolean) are required" },
        { status: 400 }
      );
    }

    await connectDB();

    // Verify session ownership
    const interviewSession = await InterviewSession.findById(sessionId)
      .select("userId")
      .lean();

    if (!interviewSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the question
    const question = await Question.findOneAndUpdate(
      { _id: questionId, sessionId },
      { isRemoved },
      { new: true }
    );

    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: question._id.toString(),
      isRemoved: question.isRemoved,
    });
  } catch (error) {
    console.error("Question update error:", error);
    return NextResponse.json(
      { error: "Failed to update question" },
      { status: 500 }
    );
  }
}
