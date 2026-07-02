import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/db/connection";
import ResumeProfile from "@/lib/db/models/ResumeProfile";
import JobDescription from "@/lib/db/models/JobDescription";
import InterviewSession from "@/lib/db/models/InterviewSession";
import { uploadToS3, buildResumeKey } from "@/lib/s3";
import { getParseResumeQueue, getParseJDQueue } from "@/lib/queue";

/**
 * Allowed MIME types and their magic byte signatures.
 *
 * We validate both the Content-Type header AND the actual file bytes.
 * This prevents type spoofing (e.g., renaming a .exe to .pdf).
 */
const ALLOWED_TYPES = {
  "application/pdf": {
    magicBytes: [0x25, 0x50, 0x44, 0x46], // %PDF
    extension: ".pdf",
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    magicBytes: [0x50, 0x4b, 0x03, 0x04], // PK (ZIP archive — DOCX is a ZIP)
    extension: ".docx",
  },
} as const;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function validateFileBytes(
  buffer: Buffer,
  declaredType: string
): { valid: boolean; reason?: string } {
  const typeInfo = ALLOWED_TYPES[declaredType as keyof typeof ALLOWED_TYPES];

  if (!typeInfo) {
    return {
      valid: false,
      reason: `Unsupported file type: ${declaredType}. Only PDF and DOCX are allowed.`,
    };
  }

  // Check magic bytes
  const header = Array.from(buffer.subarray(0, 4));
  const matches = typeInfo.magicBytes.every(
    (byte, i) => header[i] === byte
  );

  if (!matches) {
    return {
      valid: false,
      reason: "File content doesn't match its declared type. Please upload a valid PDF or DOCX file.",
    };
  }

  return { valid: true };
}

/**
 * POST /api/upload
 *
 * Accepts multipart form data with:
 *   - resumeFile: PDF or DOCX file (required)
 *   - jdText: string (required if no jdFile)
 *   - jdFile: PDF or DOCX file (optional, alternative to jdText)
 *
 * Flow:
 * 1. Validate auth session
 * 2. Parse multipart form data
 * 3. Validate file type (magic bytes) and size
 * 4. Upload resume to S3
 * 5. Create ResumeProfile + JobDescription + InterviewSession in MongoDB
 * 6. Enqueue parse-resume and parse-jd BullMQ jobs
 * 7. Return sessionId for redirect to waiting screen
 */
export async function POST(req: NextRequest) {
  try {
    // ── Auth check ──────────────────────────────────────────
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // ── Parse form data ──────────────────────────────────────
    const formData = await req.formData();
    const resumeFile = formData.get("resumeFile") as File | null;
    const jdText = formData.get("jdText") as string | null;
    const jdFile = formData.get("jdFile") as File | null;

    // ── Validate resume ──────────────────────────────────────
    if (!resumeFile) {
      return NextResponse.json(
        { error: "Resume file is required" },
        { status: 400 }
      );
    }

    if (resumeFile.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Resume file must be under 5MB" },
        { status: 400 }
      );
    }

    const resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
    const resumeValidation = validateFileBytes(resumeBuffer, resumeFile.type);
    if (!resumeValidation.valid) {
      return NextResponse.json(
        { error: resumeValidation.reason },
        { status: 400 }
      );
    }

    // ── Validate JD ──────────────────────────────────────────
    if (!jdText && !jdFile) {
      return NextResponse.json(
        { error: "Job description is required (paste text or upload a file)" },
        { status: 400 }
      );
    }

    let jdRawText = jdText || "";
    let jdFileUrl: string | undefined;

    if (jdFile) {
      if (jdFile.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "JD file must be under 5MB" },
          { status: 400 }
        );
      }

      const jdBuffer = Buffer.from(await jdFile.arrayBuffer());
      const jdValidation = validateFileBytes(jdBuffer, jdFile.type);
      if (!jdValidation.valid) {
        return NextResponse.json(
          { error: jdValidation.reason },
          { status: 400 }
        );
      }

      // Upload JD file to S3
      const jdKey = `jd-files/${userId}/${Date.now()}-${jdFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      jdFileUrl = await uploadToS3(jdBuffer, jdKey, jdFile.type);
      // The text extraction will happen in the worker
      jdRawText = "__FILE_PENDING_EXTRACTION__";
    }

    if (!jdFile && (!jdRawText || jdRawText.trim().length < 20)) {
      return NextResponse.json(
        {
          error:
            "Job description must be at least 20 characters. Paste the full JD for best results.",
        },
        { status: 400 }
      );
    }

    // ── Upload resume to S3 ──────────────────────────────────
    const resumeKey = buildResumeKey(userId, resumeFile.name);
    const resumeUrl = await uploadToS3(resumeBuffer, resumeKey, resumeFile.type);

    // ── Create database records ──────────────────────────────
    await connectDB();

    const resumeProfile = await ResumeProfile.create({
      userId,
      rawFileUrl: resumeUrl,
      originalFileName: resumeFile.name,
      status: "parsing",
    });

    const jobDescription = await JobDescription.create({
      userId,
      rawText: jdRawText,
      rawFileUrl: jdFileUrl || undefined,
      status: "parsing",
    });

    const interviewSession = await InterviewSession.create({
      userId,
      resumeProfileId: resumeProfile._id,
      jobDescriptionId: jobDescription._id,
      status: "parsing",
    });

    // ── Enqueue parsing jobs ──────────────────────────────────
    const sessionId = interviewSession._id.toString();

    await getParseResumeQueue().add("parse-resume", {
      resumeProfileId: resumeProfile._id.toString(),
      sessionId,
      fileUrl: resumeUrl,
      fileType: resumeFile.type,
    });

    await getParseJDQueue().add("parse-jd", {
      jobDescriptionId: jobDescription._id.toString(),
      sessionId,
      rawText: jdRawText !== "__FILE_PENDING_EXTRACTION__" ? jdRawText : null,
      fileUrl: jdFileUrl || null,
      fileType: jdFile?.type || null,
    });

    return NextResponse.json({ sessionId }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to process upload. Please try again." },
      { status: 500 }
    );
  }
}
