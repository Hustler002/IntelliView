import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { callLLM } from "../lib/llm";
import { updateSessionStatus } from "../lib/sessionStatusUpdater";
import mongoose from "mongoose";

// ── Zod schema for validating LLM output ─────────────────────────

const ResumeParseResultSchema = z.object({
  skills: z.array(z.string()).min(1, "At least one skill expected"),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      duration: z.string(),
      description: z.string().default(""),
    })
  ),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string(),
    })
  ),
  seniority_signal: z.enum(["junior", "mid", "senior", "lead"]),
});

export type ResumeParseResult = z.infer<typeof ResumeParseResultSchema>;

// ── LLM System Prompt (visible, reviewable, not buried in concatenation) ──

const RESUME_PARSE_SYSTEM_PROMPT = `You are a resume parser. Given the raw text of a resume, extract structured data.

Return a JSON object with exactly these fields:
- skills: string[] — technical and soft skills mentioned (be thorough, include programming languages, frameworks, tools, methodologies, and soft skills)
- experience: { title: string, company: string, duration: string, description: string }[] — work experience entries, ordered by most recent first
- education: { degree: string, institution: string, year: string }[] — education entries
- seniority_signal: "junior" | "mid" | "senior" | "lead" — inferred from years of experience, role titles, and responsibilities

Guidelines:
- Extract ALL skills mentioned, even if they appear only in project descriptions
- For duration, use the format as written (e.g., "Jan 2020 - Present", "2 years")
- If education year is unclear, use "N/A"
- Base seniority_signal on: junior (0-2 years), mid (2-5 years), senior (5-10 years), lead (10+ years or explicit lead/principal titles)

Return ONLY valid JSON. No markdown, no explanation, no code fences.`;

// ── S3 Download Helper ───────────────────────────────────────────

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

async function downloadFromS3(fileUrl: string): Promise<Buffer> {
  // Extract bucket and key from the S3 URL
  const url = new URL(fileUrl);
  const bucket = url.hostname.split(".")[0];
  const key = url.pathname.slice(1); // Remove leading /

  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// ── Text Extraction ──────────────────────────────────────────────

async function extractText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  if (fileType === "application/pdf") {
    // pdf-parse is a CommonJS module
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text;
  }

  if (
    fileType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

// ── Job Data Interface ───────────────────────────────────────────

interface ParseResumeJobData {
  resumeProfileId: string;
  sessionId: string;
  fileUrl: string;
  fileType: string;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createParseResumeWorker(
  connection: IORedis
): Worker<ParseResumeJobData> {
  const worker = new Worker<ParseResumeJobData>(
    "parse-resume",
    async (job: Job<ParseResumeJobData>) => {
      const { resumeProfileId, sessionId, fileUrl, fileType } = job.data;
      const ResumeProfile = mongoose.model("ResumeProfile");

      console.log(
        `[ParseResume] Processing resume ${resumeProfileId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        // 1. Download file from S3
        const buffer = await downloadFromS3(fileUrl);

        // 2. Extract raw text
        const rawText = await extractText(buffer, fileType);

        if (!rawText || rawText.trim().length < 20) {
          throw new Error(
            "Could not extract meaningful text from the resume. The file may be image-based (scanned). Please upload a text-based PDF or DOCX."
          );
        }

        // 3. LLM call for structured parsing
        const llmResponse = await callLLM(
          RESUME_PARSE_SYSTEM_PROMPT,
          `Here is the raw text of a resume to parse:\n\n${rawText}`
        );

        // 4. Parse and validate with Zod
        let parsed: ResumeParseResult;
        try {
          const jsonData = JSON.parse(llmResponse);
          parsed = ResumeParseResultSchema.parse(jsonData);
        } catch (parseError) {
          throw new Error(
            `LLM returned malformed JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }

        // 5. Update MongoDB
        await ResumeProfile.findByIdAndUpdate(resumeProfileId, {
          status: "parsed",
          parsedSkills: parsed.skills,
          parsedExperience: parsed.experience,
          parsedEducation: parsed.education,
          senioritySignal: parsed.seniority_signal,
          failureReason: null,
        });

        console.log(
          `[ParseResume] ✓ Resume ${resumeProfileId} parsed (${parsed.skills.length} skills, ${parsed.experience.length} experiences)`
        );

        // 6. Check if both parsers are done → update session status
        await updateSessionStatus(sessionId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[ParseResume] ✗ Resume ${resumeProfileId} failed: ${errorMessage}`
        );

        // If this was the last attempt, mark as failed
        if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
          await ResumeProfile.findByIdAndUpdate(resumeProfileId, {
            status: "parse_failed",
            failureReason: errorMessage,
          });
          await updateSessionStatus(sessionId);
        }

        throw error; // Re-throw so BullMQ retries if attempts remain
      }
    },
    {
      connection,
      concurrency: 3, // Process up to 3 resumes in parallel
    }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[ParseResume] Job ${job?.id} failed permanently:`,
      error.message
    );
  });

  return worker;
}
