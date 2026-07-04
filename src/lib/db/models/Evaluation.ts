import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IEvaluation extends Document {
  _id: Types.ObjectId;
  answerId: Types.ObjectId;
  sessionId: Types.ObjectId; // Denormalized for session-level aggregation
  correctnessScore: number; // 1-10
  communicationScore: number; // 1-10
  confidenceScore: number; // 1-10
  feedback: string; // Detailed LLM feedback
  improvementNotes: string; // Actionable next steps
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationSchema = new Schema<IEvaluation>(
  {
    answerId: {
      type: Schema.Types.ObjectId,
      ref: "Answer",
      required: true,
      unique: true, // One evaluation per answer
    },
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "InterviewSession",
      required: true,
      index: true,
    },
    correctnessScore: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    communicationScore: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    confidenceScore: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    feedback: {
      type: String,
      required: [true, "Feedback is required"],
    },
    improvementNotes: {
      type: String,
      required: [true, "Improvement notes are required"],
    },
  },
  {
    timestamps: true,
  }
);

const Evaluation: Model<IEvaluation> =
  mongoose.models.Evaluation ||
  mongoose.model<IEvaluation>("Evaluation", EvaluationSchema);

export default Evaluation;
