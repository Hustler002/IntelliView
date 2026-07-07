import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import JobDescription from "@/lib/db/models/JobDescription";
import Evaluation from "@/lib/db/models/Evaluation";
import { aggregateScores } from "@/lib/scoring";

/**
 * GET /api/sessions
 *
 * Returns all interview sessions for the current user.
 * Includes: session ID, JD role, date, overall score, status.
 * Used by both the dashboard (recent sessions) and the progress page.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const sessions = await InterviewSession.find({
      userId: session.user.id,
    }).sort({ createdAt: -1 });

    // Fetch JD data for all sessions
    const jdIds = [...new Set(sessions.map((s) => s.jobDescriptionId.toString()))];
    const jds = await JobDescription.find({ _id: { $in: jdIds } });
    const jdMap = new Map(jds.map((j) => [j._id.toString(), j]));

    // Build response with scores
    const sessionsData = await Promise.all(
      sessions.map(async (s) => {
        const jd = jdMap.get(s.jobDescriptionId.toString());

        // Use cached score if available, otherwise compute
        let overallScore = s.overallScore;
        if (overallScore === undefined && s.status === "completed") {
          const evaluations = await Evaluation.find({
            sessionId: s._id,
          });
          if (evaluations.length > 0) {
            const scores = aggregateScores(
              evaluations.map((e) => ({
                correctnessScore: e.correctnessScore,
                communicationScore: e.communicationScore,
                confidenceScore: e.confidenceScore,
              }))
            );
            overallScore = scores.overall;
            // Cache it
            await InterviewSession.findByIdAndUpdate(s._id, {
              overallScore: scores.overall,
            });
          }
        }

        return {
          id: s._id.toString(),
          status: s.status,
          createdAt: s.createdAt,
          completedAt: s.completedAt,
          role: jd?.role || "Unknown",
          seniority: jd?.seniority || "Unknown",
          overallScore: overallScore ?? null,
          jobDescriptionId: s.jobDescriptionId.toString(),
          resumeProfileId: s.resumeProfileId.toString(),
        };
      })
    );

    return NextResponse.json({ sessions: sessionsData });
  } catch (error) {
    console.error("Sessions fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
