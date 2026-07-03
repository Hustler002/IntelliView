import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type QuestionType = "hr" | "technical" | "behavioral";

export interface IQuestion extends Document {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  type: QuestionType;
  text: string;
  rationale: string;
  order: number;
  isRemoved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema<IQuestion>(
  {
    sessionId: {
      type: Schema.Types.ObjectId,
      ref: "InterviewSession",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["hr", "technical", "behavioral"],
      required: [true, "Question type is required"],
    },
    text: {
      type: String,
      required: [true, "Question text is required"],
    },
    rationale: {
      type: String,
      required: [true, "Rationale is required"],
    },
    order: {
      type: Number,
      required: true,
    },
    isRemoved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient retrieval: all questions for a session, sorted by order
QuestionSchema.index({ sessionId: 1, order: 1 });

const Question: Model<IQuestion> =
  mongoose.models.Question ||
  mongoose.model<IQuestion>("Question", QuestionSchema);

export default Question;
