import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type JDStatus = "parsing" | "parsed" | "parse_failed";

export interface IJobDescription extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rawText: string;
  rawFileUrl?: string; // Only set if JD was uploaded as a file
  status: JDStatus;
  failureReason?: string;
  role?: string;
  seniority?: string;
  requiredSkills: string[];
  niceToHave: string[];
  createdAt: Date;
  updatedAt: Date;
}

const JobDescriptionSchema = new Schema<IJobDescription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rawText: {
      type: String,
      required: [true, "Job description text is required"],
    },
    rawFileUrl: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["parsing", "parsed", "parse_failed"],
      default: "parsing",
    },
    failureReason: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      default: null,
    },
    seniority: {
      type: String,
      enum: ["junior", "mid", "senior", "lead", "staff", null],
      default: null,
    },
    requiredSkills: {
      type: [String],
      default: [],
    },
    niceToHave: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const JobDescription: Model<IJobDescription> =
  mongoose.models.JobDescription ||
  mongoose.model<IJobDescription>("JobDescription", JobDescriptionSchema);

export default JobDescription;
