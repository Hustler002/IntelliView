import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type SessionStatus =
  | "parsing"
  | "generating_questions"
  | "questions_ready"
  | "questions_failed"
  | "ready"
  | "in_progress"
  | "evaluating"
  | "completed"
  | "parse_failed";

export interface IInterviewSession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  resumeProfileId: Types.ObjectId;
  jobDescriptionId: Types.ObjectId;
  status: SessionStatus;
  failureReason?: string;
  createdAt: Date;
  completedAt?: Date;
}

const InterviewSessionSchema = new Schema<IInterviewSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resumeProfileId: {
      type: Schema.Types.ObjectId,
      ref: "ResumeProfile",
      required: true,
    },
    jobDescriptionId: {
      type: Schema.Types.ObjectId,
      ref: "JobDescription",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "parsing",
        "generating_questions",
        "questions_ready",
        "questions_failed",
        "ready",
        "in_progress",
        "evaluating",
        "completed",
        "parse_failed",
      ],
      default: "parsing",
    },
    failureReason: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const InterviewSession: Model<IInterviewSession> =
  mongoose.models.InterviewSession ||
  mongoose.model<IInterviewSession>(
    "InterviewSession",
    InterviewSessionSchema
  );

export default InterviewSession;
