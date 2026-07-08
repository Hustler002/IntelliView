"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Admin Jobs Page
 *
 * Lists recent BullMQ jobs across all 5 queues (parse-resume, parse-jd,
 * generate-questions, transcribe-evaluate, synthesize-roadmap) with
 * status, timestamps, and failure reasons.
 *
 * Behind an isAdmin check (enforced server-side in the API route).
 * If the user isn't an admin, they see a 403 message.
 */

interface JobSummary {
  id: string;
  queue: string;
  name: string;
  status: string;
  attemptsMade: number;
  data: {
    sessionId?: string;
    resumeProfileId?: string;
    jobDescriptionId?: string;
  };
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  timestamp?: number;
}

interface JobsResponse {
  jobs: JobSummary[];
  queueNames: string[];
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "#2F9E5B",
  failed: "#D64545",
  active: "#E8A33D",
  waiting: "#6B7280",
  delayed: "#8B5CF6",
};

const STATUS_LABELS: Record<string, string> = {
  completed: "✓ Completed",
  failed: "✗ Failed",
  active: "⟳ Active",
  waiting: "◌ Waiting",
  delayed: "⏳ Delayed",
};

function formatTime(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

function formatDuration(start?: number, end?: number): string {
  if (!start || !end) return "—";
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function AdminJobsPage() {
  const [data, setData] = useState<JobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterQueue, setFilterQueue] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/jobs");
      if (res.status === 403) {
        setError("Access denied — admin privileges required.");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchJobs, 10000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const filteredJobs = data?.jobs.filter((job) => {
    if (filterQueue !== "all" && job.queue !== filterQueue) return false;
    if (filterStatus !== "all" && job.status !== filterStatus) return false;
    return true;
  });

  // Count by status for summary
  const statusCounts = data?.jobs.reduce(
    (acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "#94A3B8" }}>
        <h1 style={{ color: "#F1F5F9", marginBottom: "1rem" }}>Loading job data...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1 style={{ color: "#D64545", marginBottom: "0.5rem" }}>⚠ Admin Access</h1>
        <p style={{ color: "#94A3B8" }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ color: "#F1F5F9", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
            🔧 Job Queue Monitor
          </h1>
          <p style={{ color: "#64748B", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            {data?.total || 0} recent jobs across {data?.queueNames.length || 0} queues
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchJobs(); }}
          style={{
            background: "#1E3A5F",
            color: "#E8A33D",
            border: "1px solid #2D4A6F",
            borderRadius: "0.5rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontSize: "0.875rem",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Status summary cards */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {Object.entries(statusCounts || {}).map(([status, count]) => (
          <div
            key={status}
            style={{
              background: "#0F1A2E",
              border: `1px solid ${STATUS_COLORS[status] || "#334155"}`,
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              minWidth: "120px",
            }}
          >
            <div style={{ color: STATUS_COLORS[status] || "#94A3B8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {STATUS_LABELS[status] || status}
            </div>
            <div style={{ color: "#F1F5F9", fontSize: "1.5rem", fontWeight: 700 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <select
          value={filterQueue}
          onChange={(e) => setFilterQueue(e.target.value)}
          style={{
            background: "#0F1A2E",
            color: "#F1F5F9",
            border: "1px solid #334155",
            borderRadius: "0.375rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
          }}
        >
          <option value="all">All Queues</option>
          {data?.queueNames.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            background: "#0F1A2E",
            color: "#F1F5F9",
            border: "1px solid #334155",
            borderRadius: "0.375rem",
            padding: "0.5rem 0.75rem",
            fontSize: "0.875rem",
          }}
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="active">Active</option>
          <option value="waiting">Waiting</option>
          <option value="delayed">Delayed</option>
        </select>
      </div>

      {/* Jobs table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1E293B" }}>
              {["ID", "Queue", "Status", "Attempts", "Session", "Created", "Duration", "Error"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "0.75rem 0.5rem",
                    color: "#64748B",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredJobs?.map((job) => (
              <tr
                key={`${job.queue}-${job.id}`}
                style={{
                  borderBottom: "1px solid #1E293B",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#0F1A2E")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "0.75rem 0.5rem", color: "#94A3B8", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {job.id?.slice(0, 8) || "—"}
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <span style={{
                    background: "#1E3A5F",
                    color: "#93C5FD",
                    padding: "0.125rem 0.5rem",
                    borderRadius: "9999px",
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                  }}>
                    {job.queue}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 0.5rem" }}>
                  <span style={{
                    color: STATUS_COLORS[job.status] || "#94A3B8",
                    fontWeight: 600,
                  }}>
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: "#94A3B8", textAlign: "center" }}>
                  {job.attemptsMade}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: "#94A3B8", fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {job.data.sessionId?.slice(0, 8) || "—"}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: "#94A3B8", whiteSpace: "nowrap" }}>
                  {formatTime(job.timestamp)}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: "#94A3B8" }}>
                  {formatDuration(job.processedOn, job.finishedOn)}
                </td>
                <td style={{ padding: "0.75rem 0.5rem", color: "#D64545", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={job.failedReason || ""}
                >
                  {job.failedReason?.slice(0, 80) || "—"}
                </td>
              </tr>
            ))}
            {(!filteredJobs || filteredJobs.length === 0) && (
              <tr>
                <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                  No jobs found matching filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
