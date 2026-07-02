import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { callLLM } from "../lib/llm";
import { updateSessionStatus } from "../lib/sessionStatusUpdater";
import mongoose from "mongoose";

// ── Zod schema for validating LLM output ─────────────────────────

const JDParseResultSchema = z.object({
  role: z.string().min(1, "Role title is required"),
  seniority: z.enum(["junior", "mid", "senior", "lead", "staff"]),
  requiredSkills: z
    .array(z.string())
    .min(1, "At least one required skill expected"),
  niceToHave: z.array(z.string()),
});

export type JDParseResult = z.infer<typeof JDParseResultSchema>;

// ── LLM System Prompt ────────────────────────────────────────────

const JD_PARSE_SYSTEM_PROMPT = `You are a job description parser. Given the raw text of a job description, extract structured data.

Return a JSON object with exactly these fields:
- role: string — the job title (e.g., "Senior Frontend Engineer", "Data Scientist")
- seniority: "junior" | "mid" | "senior" | "lead" | "staff" — inferred from the title and requirements
- requiredSkills: string[] — must-have skills, qualifications, and technologies explicitly required
- niceToHave: string[] — preferred, bonus, or "nice-to-have" qualifications

Guidelines:
- Be specific with skill names (e.g., "React" not just "frontend framework")
- Include both technical skills and soft skills if mentioned as requirements
- If seniority isn't explicit, infer from years of experience required and role expectations
- Separate hard requirements from nice-to-haves carefully — look for words like "preferred", "bonus", "nice to have", "ideally"

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
  const url = new URL(fileUrl);
  const bucket = url.hostname.split(".")[0];
  const key = url.pathname.slice(1);

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

async function extractTextFromFile(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  if (fileType === "application/pdf") {
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

interface ParseJDJobData {
  jobDescriptionId: string;
  sessionId: string;
  rawText: string | null; // Present if user pasted text
  fileUrl: string | null; // Present if user uploaded a file
  fileType: string | null;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createParseJDWorker(
  connection: IORedis
): Worker<ParseJDJobData> {
  const worker = new Worker<ParseJDJobData>(
    "parse-jd",
    async (job: Job<ParseJDJobData>) => {
      const { jobDescriptionId, sessionId, rawText, fileUrl, fileType } =
        job.data;
      const JobDescription = mongoose.model("JobDescription");

      console.log(
        `[ParseJD] Processing JD ${jobDescriptionId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        // 1. Get the raw text — either from the job data or by extracting from file
        let jdText = rawText;

        if (!jdText && fileUrl && fileType) {
          const buffer = await downloadFromS3(fileUrl);
          jdText = await extractTextFromFile(buffer, fileType);

          // Persist the extracted text
          await JobDescription.findByIdAndUpdate(jobDescriptionId, {
            rawText: jdText,
          });
        }

        if (!jdText || jdText.trim().length < 10) {
          throw new Error(
            "Job description text is too short or empty. Please provide a more detailed JD."
          );
        }

        // 2. LLM call for structured parsing
        const llmResponse = await callLLM(
          JD_PARSE_SYSTEM_PROMPT,
          `Here is the raw text of a job description to parse:\n\n${jdText}`
        );

        // 3. Parse and validate with Zod
        let parsed: JDParseResult;
        try {
          const jsonData = JSON.parse(llmResponse);
          parsed = JDParseResultSchema.parse(jsonData);
        } catch (parseError) {
          throw new Error(
            `LLM returned malformed JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }

        // 4. Update MongoDB
        await JobDescription.findByIdAndUpdate(jobDescriptionId, {
          status: "parsed",
          role: parsed.role,
          seniority: parsed.seniority,
          requiredSkills: parsed.requiredSkills,
          niceToHave: parsed.niceToHave,
          failureReason: null,
        });

        console.log(
          `[ParseJD] ✓ JD ${jobDescriptionId} parsed (role: ${parsed.role}, ${parsed.requiredSkills.length} required skills)`
        );

        // 5. Check if both parsers are done → update session status
        await updateSessionStatus(sessionId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[ParseJD] ✗ JD ${jobDescriptionId} failed: ${errorMessage}`
        );

        if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
          await JobDescription.findByIdAndUpdate(jobDescriptionId, {
            status: "parse_failed",
            failureReason: errorMessage,
          });
          await updateSessionStatus(sessionId);
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[ParseJD] Job ${job?.id} failed permanently:`,
      error.message
    );
  });

  return worker;
}
