import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Queue } from "bullmq";

/**
 * GET /api/admin/jobs
 *
 * Lists recent jobs across all 5 BullMQ queues with their status,
 * timestamps, and failure reasons. Gated by isAdmin check.
 *
 * Admin access is controlled by the ADMIN_EMAILS env var (comma-separated).
 * This is intentionally simple — no role column in the DB — because this
 * is a portfolio project and the admin page is a debugging/observability
 * tool, not a user-facing feature.
 */

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  // If no ADMIN_EMAILS configured, allow any authenticated user (dev convenience)
  if (ADMIN_EMAILS.length === 0) return true;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

const QUEUE_NAMES = [
  "parse-resume",
  "parse-jd",
  "generate-questions",
  "transcribe-evaluate",
  "synthesize-roadmap",
];

function getConnectionConfig() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const url = new URL(redisUrl);
  const useTls = url.protocol === "rediss:";

  return {
    host: url.hostname || "localhost",
    port: parseInt(url.port || "6379", 10),
    password: url.password || undefined,
    maxRetriesPerRequest: null as null,
    ...(useTls ? { tls: {} } : {}),
  };
}

interface JobSummary {
  id: string | undefined;
  queue: string;
  name: string;
  status: string;
  attemptsMade: number;
  data: Record<string, unknown>;
  failedReason?: string;
  processedOn: number | undefined;
  finishedOn: number | undefined;
  timestamp: number | undefined;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdmin(session.user.email)) {
      return NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 });
    }

    const connection = getConnectionConfig();
    const allJobs: JobSummary[] = [];

    for (const queueName of QUEUE_NAMES) {
      const queue = new Queue(queueName, { connection });

      try {
        // Fetch recent jobs from each state
        const [completed, failed, active, waiting, delayed] = await Promise.all([
          queue.getJobs(["completed"], 0, 10),
          queue.getJobs(["failed"], 0, 10),
          queue.getJobs(["active"], 0, 5),
          queue.getJobs(["waiting"], 0, 5),
          queue.getJobs(["delayed"], 0, 5),
        ]);

        const mapJobs = (jobs: Awaited<ReturnType<typeof queue.getJobs>>, status: string) =>
          jobs.map((job) => ({
            id: job.id,
            queue: queueName,
            name: job.name,
            status,
            attemptsMade: job.attemptsMade,
            data: {
              sessionId: (job.data as Record<string, unknown>)?.sessionId,
              resumeProfileId: (job.data as Record<string, unknown>)?.resumeProfileId,
              jobDescriptionId: (job.data as Record<string, unknown>)?.jobDescriptionId,
            },
            failedReason: job.failedReason || undefined,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
            timestamp: job.timestamp,
          }));

        allJobs.push(
          ...mapJobs(completed, "completed"),
          ...mapJobs(failed, "failed"),
          ...mapJobs(active, "active"),
          ...mapJobs(waiting, "waiting"),
          ...mapJobs(delayed, "delayed")
        );
      } finally {
        await queue.close();
      }
    }

    // Sort by timestamp descending (most recent first)
    allJobs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return NextResponse.json({
      jobs: allJobs.slice(0, 100), // Cap at 100 most recent
      queueNames: QUEUE_NAMES,
      total: allJobs.length,
    });
  } catch (error) {
    console.error("Admin jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch job data" },
      { status: 500 }
    );
  }
}
