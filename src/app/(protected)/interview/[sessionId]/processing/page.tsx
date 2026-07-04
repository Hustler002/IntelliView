"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Processing screen — shows per-question transcription and evaluation
 * progress while BullMQ workers process the answers.
 *
 * Polls /api/interview/[sessionId]/progress every 3 seconds.
 * Auto-navigates to results when session status is "completed".
 */

interface QuestionProgress {
  questionId: string;
  questionText: string;
  questionType: string;
  order: number;
  answerStatus: string;
  hasEvaluation: boolean;
  failureReason: string | null;
}

interface ProgressData {
  sessionStatus: string;
  totalQuestions: number;
  completedEvaluations: number;
  failedEvaluations: number;
  questions: QuestionProgress[];
}

function getStatusIcon(answerStatus: string, hasEvaluation: boolean) {
  if (hasEvaluation) {
    return <CheckCircle2 className="w-5 h-5 text-success" />;
  }
  if (answerStatus === "failed") {
    return <XCircle className="w-5 h-5 text-alert" />;
  }
  if (answerStatus === "evaluating") {
    return <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />;
  }
  if (answerStatus === "transcribing") {
    return <Loader2 className="w-5 h-5 text-sky-400 animate-spin" />;
  }
  if (answerStatus === "uploaded") {
    return <Clock className="w-5 h-5 text-navy-400" />;
  }
  return <Clock className="w-5 h-5 text-navy-500" />;
}

function getStatusLabel(answerStatus: string, hasEvaluation: boolean): string {
  if (hasEvaluation) return "Evaluated";
  if (answerStatus === "failed") return "Failed";
  if (answerStatus === "evaluating") return "Evaluating";
  if (answerStatus === "transcribing") return "Transcribing";
  if (answerStatus === "uploaded") return "Queued";
  return "Pending";
}

export default function ProcessingPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/interview/${sessionId}/progress`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to fetch progress");
        return;
      }

      const data: ProgressData = await res.json();
      setProgress(data);

      // Auto-navigate when completed
      if (data.sessionStatus === "completed") {
        setTimeout(() => {
          router.push(`/interview/${sessionId}/results`);
        }, 1500);
      }
    } catch {
      setError("Connection lost. Retrying…");
    }
  }, [sessionId, router]);

  // Poll every 3 seconds
  useEffect(() => {
    fetchProgress();

    const interval = setInterval(fetchProgress, 3000);
    return () => clearInterval(interval);
  }, [fetchProgress]);

  const isComplete = progress?.sessionStatus === "completed";
  const hasFailed = (progress?.failedEvaluations ?? 0) > 0;

  return (
    <div className="max-w-lg mx-auto py-8 sm:py-16 animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        <div
          className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 ${
            isComplete
              ? "bg-success/10"
              : hasFailed
                ? "bg-alert/10"
                : "bg-amber-500/10"
          }`}
        >
          {isComplete ? (
            <CheckCircle2 className="w-8 h-8 text-success" />
          ) : (
            <Sparkles
              className={`w-8 h-8 text-amber-500 ${!hasFailed ? "animate-pulse" : ""}`}
            />
          )}
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {isComplete
            ? "All done!"
            : hasFailed
              ? "Some evaluations failed"
              : "Evaluating your answers"}
        </h1>

        <p className="text-navy-400 text-sm">
          {isComplete
            ? "Your results are ready. Redirecting…"
            : hasFailed
              ? "Some answers couldn't be evaluated. You can retry them."
              : "Your answers are being transcribed and evaluated. This usually takes 1–2 minutes."}
        </p>
      </div>

      {/* Overall progress */}
      {progress && (
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-navy-400">Progress</span>
            <span className="text-white font-medium">
              {progress.completedEvaluations} of {progress.totalQuestions}{" "}
              evaluated
            </span>
          </div>
          <div className="mt-2 h-2 bg-navy-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progress.totalQuestions > 0 ? (progress.completedEvaluations / progress.totalQuestions) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Per-question status */}
      {progress && (
        <div className="space-y-2">
          {progress.questions.map((q) => (
            <div
              key={q.questionId}
              className={`glass-card p-4 flex items-center gap-3 transition-all ${
                q.hasEvaluation ? "opacity-70" : ""
              }`}
            >
              {getStatusIcon(q.answerStatus, q.hasEvaluation)}

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{q.questionText}</p>
                <p className="text-xs text-navy-500 mt-0.5">
                  {q.questionType.charAt(0).toUpperCase() +
                    q.questionType.slice(1)}{" "}
                  · {getStatusLabel(q.answerStatus, q.hasEvaluation)}
                </p>
              </div>

              {q.answerStatus === "failed" && q.failureReason && (
                <span
                  className="text-xs text-alert max-w-[120px] truncate"
                  title={q.failureReason}
                >
                  {q.failureReason}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && !progress && (
        <div className="text-center mt-8">
          <AlertCircle className="w-8 h-8 text-alert mx-auto mb-3" />
          <p className="text-sm text-navy-400">{error}</p>
        </div>
      )}

      {/* Navigate to results button (shown when complete) */}
      {isComplete && (
        <div className="flex justify-center mt-8 animate-fade-in">
          <Button
            variant="primary"
            size="lg"
            onClick={() => router.push(`/interview/${sessionId}/results`)}
          >
            View Results
          </Button>
        </div>
      )}
    </div>
  );
}
