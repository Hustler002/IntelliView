import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getSessionJobStatus,
  verifySessionOwnership,
} from "@/lib/jobStatus";

/**
 * GET /api/session/[sessionId]/status
 *
 * Returns the current status of an interview session, including the
 * individual statuses of resume and JD parsing. Auth-gated: only the
 * session owner can check status.
 *
 * Uses the shared jobStatus helper — not inline queries — so every
 * consumer of session status reads from the same canonical source.
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

    // Auth check: only session owner can view status
    const isOwner = await verifySessionOwnership(sessionId, session.user.id);
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const status = await getSessionJobStatus(sessionId);
    if (!status) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: status.sessionStatus,
      resumeStatus: status.resumeStatus,
      jdStatus: status.jdStatus,
      failureReason: status.failureReason,
      questionsGenerated: status.questionsGenerated,
    });
  } catch (error) {
    console.error("Session status error:", error);
    return NextResponse.json(
      { error: "Failed to fetch session status" },
      { status: 500 }
    );
  }
}
