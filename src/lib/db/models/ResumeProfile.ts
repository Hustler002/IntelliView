import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IExperience {
  title: string;
  company: string;
  duration: string;
  description: string;
}

export interface IEducation {
  degree: string;
  institution: string;
  year: string;
}

export type ResumeStatus = "uploading" | "parsing" | "parsed" | "parse_failed";

export interface IResumeProfile extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rawFileUrl: string;
  originalFileName: string;
  status: ResumeStatus;
  failureReason?: string;
  parsedSkills: string[];
  parsedExperience: IExperience[];
  parsedEducation: IEducation[];
  senioritySignal?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ExperienceSchema = new Schema<IExperience>(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    duration: { type: String, required: true },
    description: { type: String, default: "" },
  },
  { _id: false } // Sub-documents don't need their own IDs
);

const EducationSchema = new Schema<IEducation>(
  {
    degree: { type: String, required: true },
    institution: { type: String, required: true },
    year: { type: String, required: true },
  },
  { _id: false }
);

const ResumeProfileSchema = new Schema<IResumeProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rawFileUrl: {
      type: String,
      required: [true, "File URL is required"],
    },
    originalFileName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["uploading", "parsing", "parsed", "parse_failed"],
      default: "uploading",
    },
    failureReason: {
      type: String,
      default: null,
    },
    parsedSkills: {
      type: [String],
      default: [],
    },
    parsedExperience: {
      type: [ExperienceSchema],
      default: [],
    },
    parsedEducation: {
      type: [EducationSchema],
      default: [],
    },
    senioritySignal: {
      type: String,
      enum: ["junior", "mid", "senior", "lead", null],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const ResumeProfile: Model<IResumeProfile> =
  mongoose.models.ResumeProfile ||
  mongoose.model<IResumeProfile>("ResumeProfile", ResumeProfileSchema);

export default ResumeProfile;
