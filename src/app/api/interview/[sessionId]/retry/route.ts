import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";

/**
 * POST /api/interview/[sessionId]/retry
 *
 * Creates a new session with the same resumeProfileId + jobDescriptionId.
 * This lets candidates retry the same JD pairing to track progress.
 * Returns the new session ID for redirect.
 */
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

    const originalSession = await InterviewSession.findById(sessionId);
    if (!originalSession) {
      return NextResponse.json(
        { error: "Original session not found" },
        { status: 404 }
      );
    }
    if (originalSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Create a new session with the same resume + JD pairing
    const newSession = await InterviewSession.create({
      userId: session.user.id,
      resumeProfileId: originalSession.resumeProfileId,
      jobDescriptionId: originalSession.jobDescriptionId,
      status: "generating_questions",
    });

    // Enqueue question generation for the new session
    const { getGenerateQuestionsQueue } = await import("@/lib/queue");
    await getGenerateQuestionsQueue().add("generate-questions", {
      sessionId: newSession._id.toString(),
      resumeProfileId: originalSession.resumeProfileId.toString(),
      jobDescriptionId: originalSession.jobDescriptionId.toString(),
    });

    return NextResponse.json({
      newSessionId: newSession._id.toString(),
    });
  } catch (error) {
    console.error("Retry session error:", error);
    return NextResponse.json(
      { error: "Failed to create retry session" },
      { status: 500 }
    );
  }
}
