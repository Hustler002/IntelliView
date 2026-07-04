import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Evaluation model — stores the scored assessment of a single answer.
 *
 * Three scoring dimensions:
 *   - correctnessScore: LLM-judged factual/conceptual accuracy (1-10)
 *   - communicationScore: LLM-judged clarity and structure (1-10)
 *   - confidenceScore: heuristic-computed from WPM, filler words, pauses (1-10)
 *
 * The feedback and improvementNotes are LLM-generated, specific to what was
 * actually said — never generic platitudes.
 *
 * One-to-one with Answer: enforced by a unique index on answerId.
 */

export interface IEvaluation extends Document {
  _id: Types.ObjectId;
  answerId: Types.ObjectId;
  sessionId: Types.ObjectId; // Denormalized for session-level aggregation
  correctnessScore: number;
  communicationScore: number;
  confidenceScore: number;
  feedback: string;
  improvementNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

const EvaluationSchema = new Schema<IEvaluation>(
  {
    answerId: {
      type: Schema.Types.ObjectId,
      ref: "Answer",
      required: true,
      unique: true, // One evaluation per answer — enforced at DB level
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
