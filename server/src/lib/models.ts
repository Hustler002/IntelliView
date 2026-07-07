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
        failureReason: { type: String, default: null },
        improvementRoadmap: { type: [String], default: undefined },
        overallScore: { type: Number, default: undefined, min: 0, max: 10 },
        completedAt: { type: Date, default: null },
      },
      { timestamps: true }
    )
  );
}

// ── Question ─────────────────────────────────────────────────────
if (!mongoose.models.Question) {
  const QuestionSchema = new Schema(
    {
      sessionId: { type: Schema.Types.ObjectId, ref: "InterviewSession", required: true, index: true },
      type: { type: String, enum: ["hr", "technical", "behavioral"], required: true },
      text: { type: String, required: true },
      rationale: { type: String, required: true },
      order: { type: Number, required: true },
      isRemoved: { type: Boolean, default: false },
    },
    { timestamps: true }
  );

  QuestionSchema.index({ sessionId: 1, order: 1 });
  mongoose.model("Question", QuestionSchema);
}

// ── Answer ─────────────────────────────────────────────────────────
if (!mongoose.models.Answer) {
  const AnswerSchema = new Schema(
    {
      questionId: { type: Schema.Types.ObjectId, ref: "Question", required: true, index: true },
      sessionId: { type: Schema.Types.ObjectId, ref: "InterviewSession", required: true, index: true },
      audioUrl: { type: String, required: true },
      audioKey: { type: String, required: true },
      transcript: { type: String, default: null },
      durationSeconds: { type: Number, default: null },
      sentimentData: { type: Schema.Types.Mixed, default: null },
      status: {
        type: String,
        enum: ["pending", "uploaded", "transcribing", "transcribed", "evaluating", "evaluated", "completed", "failed"],
        default: "pending",
      },
      failureReason: { type: String, default: null },
    },
    { timestamps: true }
  );

  AnswerSchema.index({ questionId: 1 }, { unique: true });
  AnswerSchema.index({ sessionId: 1, createdAt: 1 });
  mongoose.model("Answer", AnswerSchema);
}

// ── Evaluation ─────────────────────────────────────────────────────
if (!mongoose.models.Evaluation) {
  const EvaluationSchema = new Schema(
    {
      answerId: { type: Schema.Types.ObjectId, ref: "Answer", required: true, unique: true },
      sessionId: { type: Schema.Types.ObjectId, ref: "InterviewSession", required: true, index: true },
      correctnessScore: { type: Number, required: true, min: 1, max: 10 },
      communicationScore: { type: Number, required: true, min: 1, max: 10 },
      confidenceScore: { type: Number, required: true, min: 1, max: 10 },
      feedback: { type: String, required: true },
      improvementNotes: { type: String, required: true },
    },
    { timestamps: true }
  );

  mongoose.model("Evaluation", EvaluationSchema);
}
console.log("[Models] All Mongoose models registered");
