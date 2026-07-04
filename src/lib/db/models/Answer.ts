import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type AnswerStatus =
  | "uploaded"
  | "transcribing"
  | "evaluating"
  | "completed"
  | "failed";

export interface IAnswer extends Document {
  _id: Types.ObjectId;
  questionId: Types.ObjectId;
  sessionId: Types.ObjectId; // Denormalized for efficient "all answers for session" query
  audioUrl: string;
  audioKey: string; // S3 key — needed for cleanup/deletion
  transcript?: string;
  durationSeconds: number;
  status: AnswerStatus;
  failureReason?: string;
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
      required: true,
      min: [0, "Duration cannot be negative"],
    },
    status: {
      type: String,
      enum: ["uploaded", "transcribing", "evaluating", "completed", "failed"],
      default: "uploaded",
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

const Answer: Model<IAnswer> =
  mongoose.models.Answer || mongoose.model<IAnswer>("Answer", AnswerSchema);

export default Answer;
