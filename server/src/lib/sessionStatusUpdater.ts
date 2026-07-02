import mongoose from "mongoose";

/**
 * Session status updater.
 *
 * After each worker completes (resume or JD parsing), this checks whether
 * both are done and updates the InterviewSession status accordingly.
 *
 * The models are imported by name to avoid circular dependencies with
 * the worker files — both the worker and this module need Mongoose models,
 * so we access them via mongoose.model() rather than direct imports.
 */

export async function updateSessionStatus(sessionId: string): Promise<void> {
  // Access models by registered name (avoids import order issues)
  const InterviewSession = mongoose.model("InterviewSession");
  const ResumeProfile = mongoose.model("ResumeProfile");
  const JobDescription = mongoose.model("JobDescription");

  const session = await InterviewSession.findById(sessionId);
  if (!session) {
    console.error(`[StatusUpdater] Session ${sessionId} not found`);
    return;
  }

  const resume = await ResumeProfile.findById(session.resumeProfileId);
  const jd = await JobDescription.findById(session.jobDescriptionId);

  if (!resume || !jd) {
    console.error(
      `[StatusUpdater] Missing resume or JD for session ${sessionId}`
    );
    return;
  }

  const resumeDone = resume.status === "parsed";
  const jdDone = jd.status === "parsed";
  const resumeFailed = resume.status === "parse_failed";
  const jdFailed = jd.status === "parse_failed";

  if (resumeFailed || jdFailed) {
    // If either failed, mark the session as failed
    const reasons: string[] = [];
    if (resumeFailed && resume.failureReason) reasons.push(`Resume: ${resume.failureReason}`);
    if (jdFailed && jd.failureReason) reasons.push(`JD: ${jd.failureReason}`);

    await InterviewSession.findByIdAndUpdate(sessionId, {
      status: "parse_failed",
      failureReason: reasons.join("; ") || "Parsing failed",
    });

    console.log(`[StatusUpdater] Session ${sessionId} → parse_failed`);
  } else if (resumeDone && jdDone) {
    // Both succeeded — mark session as ready
    await InterviewSession.findByIdAndUpdate(sessionId, {
      status: "ready",
    });

    console.log(`[StatusUpdater] Session ${sessionId} → ready`);
  }
  // Otherwise, at least one is still parsing — no update needed
}
