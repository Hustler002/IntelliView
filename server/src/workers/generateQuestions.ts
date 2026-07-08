import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import mongoose from "mongoose";
import { callLLM } from "../lib/llm";
import {
  validateQuestionResponse,
  QuestionItem,
} from "../lib/questionSchema";

// ── LLM System Prompt ────────────────────────────────────────────
// This is the exact prompt sent to the LLM at runtime.
// Visible here for reviewability — not buried in concatenation.

const QUESTION_GENERATION_SYSTEM_PROMPT = `You are an experienced technical interviewer preparing questions for a specific candidate and a specific role. You will be given the candidate's parsed resume (skills, experience, education) and the parsed job description (role, seniority, required skills). Generate exactly 10 interview questions:
- 3 HR/culture-fit questions, grounded in the candidate's actual background (e.g. referencing a specific project or gap, not generic 'tell me about yourself')
- 4 technical questions that probe the overlap between the candidate's stated skills and the JD's required skills — include at least one question on a skill the JD requires but the resume doesn't clearly show, to test depth
- 3 behavioral questions (STAR-format friendly) tied to the seniority level implied by the JD
Return strictly valid JSON: an array of objects with these exact fields:
- "type": one of exactly these three string values: "hr", "technical", "behavioral" (lowercase, no other values allowed)
- "text": the interview question text
- "rationale": one sentence on why this question was chosen for this candidate/role pair
No prose outside the JSON. Example format: [{"type":"hr","text":"...","rationale":"..."}, ...]`;

// ── Retry Suffix ─────────────────────────────────────────────────
// Appended to the user prompt on the second LLM attempt if validation fails.

const STRICT_JSON_REMINDER = `

IMPORTANT: Your previous response was not valid JSON. You MUST return ONLY a valid JSON array. No markdown, no code fences, no explanatory text. Just the raw JSON array starting with [ and ending with ].`;

// ── Job Data Interface ───────────────────────────────────────────

interface GenerateQuestionsJobData {
  sessionId: string;
  resumeProfileId: string;
  jobDescriptionId: string;
}

// ── User Prompt Assembly ─────────────────────────────────────────

interface ResumeData {
  parsedSkills: string[];
  parsedExperience: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>;
  parsedEducation: Array<{
    degree: string;
    institution: string;
    year: string;
  }>;
  senioritySignal?: string;
}

interface JDData {
  role?: string;
  seniority?: string;
  requiredSkills: string[];
  niceToHave: string[];
}

function assembleUserPrompt(resume: ResumeData, jd: JDData): string {
  const experienceBlock = resume.parsedExperience
    .map(
      (exp) =>
        `  - ${exp.title} at ${exp.company} (${exp.duration})${exp.description ? `: ${exp.description}` : ""}`
    )
    .join("\n");

  const educationBlock = resume.parsedEducation
    .map((edu) => `  - ${edu.degree}, ${edu.institution} (${edu.year})`)
    .join("\n");

  return `## Candidate Resume

**Skills:** ${resume.parsedSkills.join(", ")}

**Experience:**
${experienceBlock || "  (none listed)"}

**Education:**
${educationBlock || "  (none listed)"}

**Estimated Seniority:** ${resume.senioritySignal || "unknown"}

---

## Job Description

**Role:** ${jd.role || "Not specified"}
**Seniority Level:** ${jd.seniority || "Not specified"}
**Required Skills:** ${jd.requiredSkills.join(", ") || "None listed"}
**Nice-to-Have:** ${jd.niceToHave.join(", ") || "None listed"}

---

Generate exactly 10 interview questions based on this resume × JD pairing. Return ONLY a JSON array.`;
}

// ── Worker Factory ───────────────────────────────────────────────

export function createGenerateQuestionsWorker(
  connection: IORedis
): Worker<GenerateQuestionsJobData> {
  const worker = new Worker<GenerateQuestionsJobData>(
    "generate-questions",
    async (job: Job<GenerateQuestionsJobData>) => {
      const { sessionId, resumeProfileId, jobDescriptionId } = job.data;
      const InterviewSession = mongoose.model("InterviewSession");
      const ResumeProfile = mongoose.model("ResumeProfile");
      const JobDescription = mongoose.model("JobDescription");
      const Question = mongoose.model("Question");

      console.log(
        `[GenerateQuestions] Processing session ${sessionId} (attempt ${job.attemptsMade + 1})`
      );

      try {
        // 1. Fetch parsed resume and JD from MongoDB
        const resume = await ResumeProfile.findById(resumeProfileId).lean();
        const jd = await JobDescription.findById(jobDescriptionId).lean();

        if (!resume || !jd) {
          throw new Error(
            `Missing data: resume=${!!resume}, jd=${!!jd} for session ${sessionId}`
          );
        }

        if (resume.status !== "parsed" || jd.status !== "parsed") {
          throw new Error(
            `Data not ready: resumeStatus=${resume.status}, jdStatus=${jd.status}`
          );
        }

        // 2. Assemble user prompt
        const userPrompt = assembleUserPrompt(
          resume as unknown as ResumeData,
          jd as unknown as JDData
        );

        // 3. Call LLM — with one retry on validation failure
        let questions: QuestionItem[];
        let rawResponse: string;

        try {
          rawResponse = await callLLM(
            QUESTION_GENERATION_SYSTEM_PROMPT,
            userPrompt
          );

          // Log raw LLM response in dev mode for prompt debugging
          if (process.env.LOG_RAW_LLM === "true") {
            console.log(
              `[GenerateQuestions] Raw LLM response:\n${rawResponse}`
            );
          }

          questions = validateQuestionResponse(rawResponse);
        } catch (firstError) {
          console.warn(
            `[GenerateQuestions] First LLM attempt failed validation, retrying with strict reminder: ${
              firstError instanceof Error ? firstError.message : String(firstError)
            }`
          );

          // Retry with stricter instruction
          rawResponse = await callLLM(
            QUESTION_GENERATION_SYSTEM_PROMPT,
            userPrompt + STRICT_JSON_REMINDER
          );

          if (process.env.LOG_RAW_LLM === "true") {
            console.log(
              `[GenerateQuestions] Raw LLM response (retry):\n${rawResponse}`
            );
          }

          questions = validateQuestionResponse(rawResponse);
        }

        // 4. Write Question documents to MongoDB
        // Delete any existing questions for this session (in case of re-run)
        await Question.deleteMany({ sessionId });

        const questionDocs = questions.map((q, index) => ({
          sessionId,
          type: q.type,
          text: q.text,
          rationale: q.rationale,
          order: index,
          isRemoved: false,
        }));

        await Question.insertMany(questionDocs);

        // 5. Update session status
        await InterviewSession.findByIdAndUpdate(sessionId, {
          status: "questions_ready",
          failureReason: null,
        });

        // Count question types for logging
        const typeCounts = questions.reduce(
          (acc, q) => {
            acc[q.type] = (acc[q.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        console.log(
          `[GenerateQuestions] ✓ Session ${sessionId}: ${questions.length} questions generated ` +
            `(hr:${typeCounts.hr || 0}, tech:${typeCounts.technical || 0}, behav:${typeCounts.behavioral || 0})`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[GenerateQuestions] ✗ Session ${sessionId} failed: ${errorMessage}`
        );

        // If this was the last attempt, mark as failed
        if (job.attemptsMade >= (job.opts.attempts ?? 3) - 1) {
          await InterviewSession.findByIdAndUpdate(sessionId, {
            status: "questions_failed",
            failureReason: `Question generation failed: ${errorMessage}`,
          });
        }

        throw error; // Re-throw so BullMQ retries if attempts remain
      }
    },
    {
      connection,
      concurrency: 2, // Lower concurrency than parsers — LLM calls are heavier
    }
  );

  worker.on("failed", (job, error) => {
    console.error(
      `[GenerateQuestions] Job ${job?.id} failed permanently:`,
      error.message
    );
  });

  return worker;
}
