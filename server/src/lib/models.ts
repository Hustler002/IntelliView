/**
 * Register all Mongoose models for the worker server.
 *
 * The worker process runs outside of Next.js, so it can't use Next.js
 * path aliases (@/). We re-define the schemas here. This is intentional
 * duplication — both Next.js and the worker need Mongoose models, and
 * sharing them across two separate TypeScript projects with different
 * module resolution is more trouble than it's worth.
 *
 * The schemas MUST be kept in sync. If you change a model in
 * src/lib/db/models/, update this file too.
 */

import mongoose, { Schema } from "mongoose";

// ── User ─────────────────────────────────────────────────────────
if (!mongoose.models.User) {
  mongoose.model(
    "User",
    new Schema(
      {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        passwordHash: { type: String, default: null, select: false },
        authProvider: { type: String, enum: ["credentials", "google"], default: "credentials" },
        needsOnboarding: { type: Boolean, default: true },
      },
      { timestamps: true }
    )
  );
}

// ── ResumeProfile ────────────────────────────────────────────────
if (!mongoose.models.ResumeProfile) {
  const ExperienceSchema = new Schema(
    {
      title: { type: String, required: true },
      company: { type: String, required: true },
      duration: { type: String, required: true },
      description: { type: String, default: "" },
    },
    { _id: false }
  );

  const EducationSchema = new Schema(
    {
      degree: { type: String, required: true },
      institution: { type: String, required: true },
      year: { type: String, required: true },
    },
    { _id: false }
  );

  mongoose.model(
    "ResumeProfile",
    new Schema(
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        rawFileUrl: { type: String, required: true },
        originalFileName: { type: String, required: true },
        status: { type: String, enum: ["uploading", "parsing", "parsed", "parse_failed"], default: "uploading" },
        failureReason: { type: String, default: null },
        parsedSkills: { type: [String], default: [] },
        parsedExperience: { type: [ExperienceSchema], default: [] },
        parsedEducation: { type: [EducationSchema], default: [] },
        senioritySignal: { type: String, enum: ["junior", "mid", "senior", "lead", null], default: null },
      },
      { timestamps: true }
    )
  );
}

// ── JobDescription ───────────────────────────────────────────────
if (!mongoose.models.JobDescription) {
  mongoose.model(
    "JobDescription",
    new Schema(
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        rawText: { type: String, required: true },
        rawFileUrl: { type: String, default: null },
        status: { type: String, enum: ["parsing", "parsed", "parse_failed"], default: "parsing" },
        failureReason: { type: String, default: null },
        role: { type: String, default: null },
        seniority: { type: String, enum: ["junior", "mid", "senior", "lead", "staff", null], default: null },
        requiredSkills: { type: [String], default: [] },
        niceToHave: { type: [String], default: [] },
      },
      { timestamps: true }
    )
  );
}

// ── InterviewSession ─────────────────────────────────────────────
if (!mongoose.models.InterviewSession) {
  mongoose.model(
    "InterviewSession",
    new Schema(
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        resumeProfileId: { type: Schema.Types.ObjectId, ref: "ResumeProfile", required: true },
        jobDescriptionId: { type: Schema.Types.ObjectId, ref: "JobDescription", required: true },
        status: {
          type: String,
          enum: ["parsing", "generating_questions", "ready", "in_progress", "completed", "parse_failed"],
          default: "parsing",
        },
        failureReason: { type: String, default: null },
        completedAt: { type: Date, default: null },
      },
      { timestamps: true }
    )
  );
}

console.log("[Models] All Mongoose models registered");
