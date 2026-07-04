import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Answer model — stores a candidate's recorded answer to a question.
 *
 * The audio is uploaded to S3 before the transcribe-evaluate worker processes it.
 * The worker fills in transcript, durationSeconds, and sentimentData as it runs.
 *
 * Status flow: pending/uploaded → transcribing → transcribed → evaluating → evaluated/completed
 *              (any step can → failed)
 */

export type AnswerStatus =
  | "pending"
  | "uploaded"
  | "transcribing"
  | "transcribed"
  | "evaluating"
  | "evaluated"
  | "completed"
  | "failed";

export interface IAnswer extends Document {
  _id: Types.ObjectId;
  questionId: Types.ObjectId;
  sessionId: Types.ObjectId; // Denormalized for "all answers in session" queries
  audioUrl: string; 
  audioKey: string; // S3 key — needed for cleanup/deletion
  transcript: string | null;
  durationSeconds: number | null;
  sentimentData: Record<string, unknown> | null; // Raw STT provider metadata
  status: AnswerStatus;
  failureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema = new Schema<IAnswer>(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "InterviewSession",
      required: true,
      index: true,
    },
    audioUrl: {
      type: String,
      required: [true, "Audio URL is required"],
    },
    audioKey: {
      type: String,
      required: [true, "Audio S3 key is required"],
    },
    transcript: {
      type: String,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: null,
    },
    sentimentData: {
      type: Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "uploaded", "transcribing", "transcribed", "evaluating", "evaluated", "completed", "failed"],
      default: "pending",
    },
    failureReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One answer per question (prevents duplicate submissions)
AnswerSchema.index({ questionId: 1 }, { unique: true });
// Compound index: get all answers for a session, ordered by creation time
AnswerSchema.index({ sessionId: 1, createdAt: 1 });

const Answer: Model<IAnswer> =
  mongoose.models.Answer ||
  mongoose.model<IAnswer>("Answer", AnswerSchema);

export default Answer;
