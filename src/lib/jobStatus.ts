import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import ResumeProfile from "@/lib/db/models/ResumeProfile";
import JobDescription from "@/lib/db/models/JobDescription";
import Question from "@/lib/db/models/Question";
import Evaluation from "@/lib/db/models/Evaluation";

/**
 * Shared job-status helper.
 *
 * Provides a single, canonical function for reading the status of an
 * interview session's entire pipeline. All polling endpoints and the
 * admin page use this instead of each inventing their own status-tracking
 * scheme.
 *
 * Status is derived from MongoDB documents — the workers update model
 * statuses as they progress, and this helper reads them.
 */

export interface SessionJobStatus {
  /** Top-level session status (parsing, generating_questions, questions_ready, etc.) */
  sessionStatus: string;

  /** Resume parsing sub-status */
  resumeStatus: string;
  resumeFailureReason: string | null;

  /** JD parsing sub-status */
  jdStatus: string;
  jdFailureReason: string | null;

  /** Combined failure reason (from session, resume, or JD) */
  failureReason: string | null;

  /** Number of questions generated (0 if still generating) */
  questionsGenerated: number;

  /** Number of evaluations completed (for progress during interview) */
  evaluationsCompleted: number;

  /** Total questions to evaluate (for progress denominator) */
  totalQuestions: number;

  /** Whether the improvement roadmap has been synthesized */
  hasRoadmap: boolean;

  /** Timestamps */
  createdAt: string;
  completedAt: string | null;
}

/**
 * Get the unified job status for an interview session.
 *
 * @param sessionId - The MongoDB ObjectId of the interview session
 * @returns SessionJobStatus or null if session not found
 */
export async function getSessionJobStatus(
  sessionId: string
): Promise<SessionJobStatus | null> {
  await connectDB();

  const interviewSession = await InterviewSession.findById(sessionId).lean();
  if (!interviewSession) return null;

  // Fetch parsing statuses and counts in parallel
  const [resume, jd, questionsGenerated, evaluationsCompleted, totalQuestions] =
    await Promise.all([
      ResumeProfile.findById(interviewSession.resumeProfileId)
        .select("status failureReason")
        .lean(),
      JobDescription.findById(interviewSession.jobDescriptionId)
        .select("status failureReason")
        .lean(),
      Question.countDocuments({ sessionId, isRemoved: false }),
      Evaluation.countDocuments({ sessionId }),
      Question.countDocuments({ sessionId, isRemoved: false }),
    ]);

  return {
    sessionStatus: interviewSession.status,
    resumeStatus: resume?.status || "unknown",
    resumeFailureReason: resume?.failureReason || null,
    jdStatus: jd?.status || "unknown",
    jdFailureReason: jd?.failureReason || null,
    failureReason:
      interviewSession.failureReason ||
      resume?.failureReason ||
      jd?.failureReason ||
      null,
    questionsGenerated,
    evaluationsCompleted,
    totalQuestions,
    hasRoadmap:
      Array.isArray(interviewSession.improvementRoadmap) &&
      interviewSession.improvementRoadmap.length > 0,
    createdAt: interviewSession.createdAt?.toISOString?.() || "",
    completedAt: interviewSession.completedAt?.toISOString?.() || null,
  };
}

/**
 * Verify session ownership. Returns true if the session belongs to the user.
 */
export async function verifySessionOwnership(
  sessionId: string,
  userId: string
): Promise<boolean> {
  await connectDB();
  const session = await InterviewSession.findById(sessionId)
    .select("userId")
    .lean();
  if (!session) return false;
  return session.userId.toString() === userId;
}
