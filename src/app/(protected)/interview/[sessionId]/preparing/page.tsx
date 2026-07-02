"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import ProgressSteps, { Step } from "@/components/ui/ProgressSteps";
import Button from "@/components/ui/Button";

/**
 * Preparing screen — shows real-time progress of resume + JD parsing.
 *
 * Polls /api/session/[sessionId]/status every 2 seconds.
 * Three-step progress indicator:
 *   1. Reading your resume…    (resume parsing)
 *   2. Understanding the role…  (JD parsing)
 *   3. Preparing your interview (transition to ready)
 *
 * On "ready" → auto-navigate to /interview/[sessionId]
 * On "parse_failed" → show error with retry button
 */

interface StatusResponse {
  status: string;
  resumeStatus: string;
  jdStatus: string;
  failureReason: string | null;
}

export default function PreparingPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${sessionId}/status`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to fetch status");
        return;
      }

      const data: StatusResponse = await res.json();
      setStatusData(data);

      // Auto-navigate when ready
      if (data.status === "ready" || data.status === "generating_questions") {
        // Small delay for the "ready" animation to be visible
        setTimeout(() => {
          router.push(`/interview/${sessionId}`);
        }, 1200);
      }
    } catch {
      setError("Connection lost. Retrying…");
    }
  }, [sessionId, router]);

  // Poll every 2 seconds
  useEffect(() => {
    fetchStatus(); // Initial fetch

    const interval = setInterval(() => {
      fetchStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Build step states from the status response
  const getSteps = (): Step[] => {
    const resumeStatus = statusData?.resumeStatus || "parsing";
    const jdStatus = statusData?.jdStatus || "parsing";
    const sessionStatus = statusData?.status || "parsing";

    const resumeStep: Step = {
      id: "resume",
      label: "Reading your resume",
      description:
        resumeStatus === "parsed"
          ? "Skills, experience, and education extracted"
          : resumeStatus === "parse_failed"
            ? "Failed to parse resume"
            : "Extracting your skills, experience, and education…",
      status:
        resumeStatus === "parsed"
          ? "completed"
          : resumeStatus === "parse_failed"
            ? "failed"
            : "active",
    };

    const jdStep: Step = {
      id: "jd",
      label: "Understanding the role",
      description:
        jdStatus === "parsed"
          ? "Role requirements and skills identified"
          : jdStatus === "parse_failed"
            ? "Failed to parse job description"
            : resumeStatus === "parsed"
              ? "Identifying role requirements and key skills…"
              : "Waiting…",
      status:
        jdStatus === "parsed"
          ? "completed"
          : jdStatus === "parse_failed"
            ? "failed"
            : resumeStatus === "parsed"
              ? "active"
              : "pending",
    };

    const readyStep: Step = {
      id: "ready",
      label: "Preparing your interview",
      description:
        sessionStatus === "ready" || sessionStatus === "generating_questions"
          ? "Your interview is ready!"
          : "Generating tailored questions…",
      status:
        sessionStatus === "ready" || sessionStatus === "generating_questions"
          ? "completed"
          : resumeStatus === "parsed" && jdStatus === "parsed"
            ? "active"
            : "pending",
    };

    return [resumeStep, jdStep, readyStep];
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    setError(null);

    try {
      await fetch(`/api/session/${sessionId}/retry`, { method: "POST" });
      // Reset status and let polling pick up the new state
      setStatusData(null);
    } catch {
      setError("Failed to retry. Please try again.");
    } finally {
      setIsRetrying(false);
    }
  };

  const isFailed = statusData?.status === "parse_failed";

  return (
    <div className="max-w-lg mx-auto py-16 animate-fade-in">
      {/* ── Header ── */}
      <div className="text-center mb-12">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center mb-5">
          <Sparkles
            className={`w-8 h-8 text-amber-500 ${!isFailed ? "animate-pulse" : ""}`}
          />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">
          {isFailed ? "Something went wrong" : "Setting up your interview"}
        </h1>
        <p className="text-navy-400 text-sm">
          {isFailed
            ? "We encountered an issue while processing your documents."
            : "This usually takes 15–30 seconds. Hang tight."}
        </p>
      </div>

      {/* ── Progress Steps ── */}
      <div className="glass-card p-8 mb-8">
        <ProgressSteps steps={getSteps()} />
      </div>

      {/* ── Failure State ── */}
      {isFailed && (
        <div className="space-y-4 animate-fade-in">
          {statusData?.failureReason && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-alert/10 border border-alert/20">
              <AlertCircle className="w-4 h-4 text-alert mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-alert">
                  Processing failed
                </p>
                <p className="text-xs text-alert/70 mt-1">
                  {statusData.failureReason}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <Button
              variant="primary"
              onClick={handleRetry}
              isLoading={isRetrying}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Try Again
            </Button>
            <Button variant="secondary" onClick={() => router.push("/upload")}>
              Upload Different Files
            </Button>
          </div>
        </div>
      )}

      {/* ── Connection Error ── */}
      {error && !isFailed && (
        <div className="text-center">
          <p className="text-sm text-navy-400">{error}</p>
        </div>
      )}
    </div>
  );
}
