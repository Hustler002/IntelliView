import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import ResumeProfile from "@/lib/db/models/ResumeProfile";
import JobDescription from "@/lib/db/models/JobDescription";

/**
 * GET /api/session/[sessionId]/status
 *
 * Returns the current status of an interview session, including the
 * individual statuses of resume and JD parsing. Auth-gated: only the
 * session owner can check status.
 *
 * Used by the waiting screen to poll progress.
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

    const interviewSession = await InterviewSession.findById(sessionId).lean();

    if (!interviewSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Auth check: only session owner can view status
    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch individual parsing statuses for the progress indicator
    const [resume, jd] = await Promise.all([
      ResumeProfile.findById(interviewSession.resumeProfileId)
        .select("status failureReason")
        .lean(),
      JobDescription.findById(interviewSession.jobDescriptionId)
        .select("status failureReason")
        .lean(),
    ]);

    return NextResponse.json({
      status: interviewSession.status,
      resumeStatus: resume?.status || "unknown",
      jdStatus: jd?.status || "unknown",
      failureReason:
        interviewSession.failureReason ||
        resume?.failureReason ||
        jd?.failureReason ||
        null,
    });
  } catch (error) {
    console.error("Session status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session status" },
      { status: 500 }
    );
  }
}
