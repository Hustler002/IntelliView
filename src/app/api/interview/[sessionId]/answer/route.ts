import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import InterviewSession from "@/lib/db/models/InterviewSession";
import Question from "@/lib/db/models/Question";
import Answer from "@/lib/db/models/Answer";
import { uploadToS3, buildAudioKey } from "@/lib/s3";
import { getTranscribeEvaluateQueue } from "@/lib/queue";

/**
 * POST /api/interview/[sessionId]/answer
 *
 * Receives audio blob + question metadata, uploads to S3,
 * creates an Answer record, and enqueues a transcribe-and-evaluate job.
 *
 * Accepts multipart form data:
 *   - audio: Blob (required)
 *   - questionId: string (required)
 *   - durationSeconds: number (required)
 *   - mimeType: string (required)
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

    // Session must be in a state that accepts answers
    if (!["in_progress", "questions_ready", "ready"].includes(interviewSession.status)) {
      return NextResponse.json(
        { error: "Session is not accepting answers" },
        { status: 400 }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const questionId = formData.get("questionId") as string | null;
    const durationStr = formData.get("durationSeconds") as string | null;
    const mimeType = (formData.get("mimeType") as string) || "audio/webm";

    if (!audioFile || !questionId || !durationStr) {
      return NextResponse.json(
        { error: "Missing required fields: audio, questionId, durationSeconds" },
        { status: 400 }
      );
    }

    const durationSeconds = parseInt(durationStr, 10);
    if (isNaN(durationSeconds) || durationSeconds < 0) {
      return NextResponse.json(
        { error: "Invalid duration" },
        { status: 400 }
      );
    }

    // Verify the question belongs to this session
    const question = await Question.findOne({
      _id: questionId,
      sessionId,
      isRemoved: false,
    });

    if (!question) {
      return NextResponse.json(
        { error: "Question not found in this session" },
        { status: 404 }
      );
    }

    // Check for duplicate answer (one answer per question)
    const existingAnswer = await Answer.findOne({ questionId });
    if (existingAnswer) {
      return NextResponse.json(
        { error: "An answer has already been submitted for this question" },
        { status: 409 }
      );
    }

    // Validate audio size (max 25MB — 3 min of WebM/Opus is typically 1-3MB)
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
    if (audioBuffer.length > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Audio file too large (max 25MB)" },
        { status: 413 }
      );
    }

    // Upload to S3
    const audioKey = buildAudioKey(sessionId, questionId, mimeType);
    const audioUrl = await uploadToS3(audioBuffer, audioKey, mimeType);

    // Create Answer record
    const answer = await Answer.create({
      questionId,
      sessionId,
      audioUrl,
      audioKey,
      durationSeconds,
      status: "uploaded",
    });

    // Mark session as in_progress if it was still in questions_ready/ready
    if (interviewSession.status === "questions_ready" || interviewSession.status === "ready") {
      await InterviewSession.findByIdAndUpdate(sessionId, {
        status: "in_progress",
      });
    }

    // Check if this was the last question
    const totalQuestions = await Question.countDocuments({
      sessionId,
      isRemoved: false,
    });
    const totalAnswers = await Answer.countDocuments({ sessionId });
    const isLastQuestion = totalAnswers >= totalQuestions;

    // If last question, transition session to evaluating
    if (isLastQuestion) {
      await InterviewSession.findByIdAndUpdate(sessionId, {
        status: "evaluating",
      });
    }

    // Enqueue transcribe-and-evaluate job
    await getTranscribeEvaluateQueue().add("transcribe-evaluate", {
      answerId: answer._id.toString(),
      sessionId,
      questionId,
      audioUrl,
      audioKey,
      mimeType,
    });

    return NextResponse.json({
      answerId: answer._id.toString(),
      isLastQuestion,
    });
  } catch (error) {
    console.error("Answer submission error:", error);
    return NextResponse.json(
      { error: "Failed to submit answer" },
      { status: 500 }
    );
  }
}
