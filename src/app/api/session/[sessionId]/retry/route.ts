import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import ResumeProfile from "@/lib/db/models/ResumeProfile";
import JobDescription from "@/lib/db/models/JobDescription";
import { getParseResumeQueue, getParseJDQueue } from "@/lib/queue";

/**
 * POST /api/session/[sessionId]/retry
 *
 * Re-enqueue failed parsing jobs for a session.
 * Only works when session status is "parse_failed".
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

    const interviewSession = await InterviewSession.findById(sessionId);
    if (!interviewSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (interviewSession.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (interviewSession.status !== "parse_failed") {
      return NextResponse.json(
        { error: "Session is not in a failed state" },
        { status: 400 }
      );
    }

    // Check which parsing failed and re-enqueue
    const resume = await ResumeProfile.findById(
      interviewSession.resumeProfileId
    );
    const jd = await JobDescription.findById(
      interviewSession.jobDescriptionId
    );

    if (resume?.status === "parse_failed") {
      await ResumeProfile.findByIdAndUpdate(resume._id, {
        status: "parsing",
        failureReason: null,
      });

      await getParseResumeQueue().add("parse-resume", {
        resumeProfileId: resume._id.toString(),
        sessionId,
        fileUrl: resume.rawFileUrl,
        fileType: resume.rawFileUrl.endsWith(".pdf")
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
    }

    if (jd?.status === "parse_failed") {
      await JobDescription.findByIdAndUpdate(jd._id, {
        status: "parsing",
        failureReason: null,
      });

      await getParseJDQueue().add("parse-jd", {
        jobDescriptionId: jd._id.toString(),
        sessionId,
        rawText: jd.rawText !== "__FILE_PENDING_EXTRACTION__" ? jd.rawText : null,
        fileUrl: jd.rawFileUrl || null,
        fileType: jd.rawFileUrl
          ? jd.rawFileUrl.endsWith(".pdf")
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : null,
      });
    }

    // Reset session status
    await InterviewSession.findByIdAndUpdate(sessionId, {
      status: "parsing",
      failureReason: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Retry error:", error);
    return NextResponse.json(
      { error: "Failed to retry parsing" },
      { status: 500 }
    );
  }
}
