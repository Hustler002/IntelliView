"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  Users,
  Code2,
  MessageSquare,
  X,
  Undo2,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Question Preview Page — lists all generated questions grouped by type.
 *
 * Shows the rationale as a muted subtitle under each question.
 * Users can optionally remove questions they don't want asked.
 * "Start Interview" button at the bottom.
 */

interface QuestionData {
  id: string;
  type: "hr" | "technical" | "behavioral";
  text: string;
  rationale: string;
  order: number;
  isRemoved: boolean;
}

const TYPE_CONFIG = {
  hr: {
    label: "HR / Culture Fit",
    icon: Users,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
    count: 3,
  },
  technical: {
    label: "Technical",
    icon: Code2,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
    borderColor: "border-blue-400/20",
    count: 4,
  },
  behavioral: {
    label: "Behavioral (STAR)",
    icon: MessageSquare,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
    borderColor: "border-emerald-400/20",
    count: 3,
  },
} as const;

type QuestionType = keyof typeof TYPE_CONFIG;

export default function QuestionPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(
        `/api/session/${sessionId}/questions?includeRemoved=true`
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load questions");
        return;
      }

      const data = await res.json();
      setQuestions(data.questions);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const toggleRemove = async (questionId: string, isRemoved: boolean) => {
    setTogglingId(questionId);
    try {
      const res = await fetch(`/api/session/${sessionId}/questions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, isRemoved }),
      });

      if (res.ok) {
        setQuestions((prev) =>
          prev.map((q) => (q.id === questionId ? { ...q, isRemoved } : q))
        );
      }
    } catch {
      // Silently fail — the UI state won't change
    } finally {
      setTogglingId(null);
    }
  };

  // Group questions by type, preserving order within each group
  const groupedQuestions = (["hr", "technical", "behavioral"] as QuestionType[]).map(
    (type) => ({
      type,
      config: TYPE_CONFIG[type],
      questions: questions.filter((q) => q.type === type),
    })
  );

  const activeCount = questions.filter((q) => !q.isRemoved).length;

  // ── Loading State ──
  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center animate-fade-in">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto mb-4" />
        <p className="text-navy-400 text-sm">Loading your interview questions…</p>
      </div>
    );
  }

  // ── Error State ──
  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-alert/10 flex items-center justify-center mb-5">
          <AlertCircle className="w-8 h-8 text-alert" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Failed to load questions</h1>
        <p className="text-navy-400 text-sm mb-6">{error}</p>
        <Button
          variant="primary"
          onClick={() => {
            setIsLoading(true);
            fetchQuestions();
          }}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Try Again
        </Button>
      </div>
    );
  }

  // ── Empty State ──
  if (questions.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-navy-800 flex items-center justify-center mb-5">
          <Sparkles className="w-8 h-8 text-navy-500" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">No questions yet</h1>
        <p className="text-navy-400 text-sm mb-6">
          Questions are still being generated. This page will update automatically.
        </p>
        <Button variant="secondary" onClick={() => router.push(`/interview/${sessionId}/preparing`)}>
          Back to Preparing
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h1 className="text-2xl font-bold text-white">Your Interview Questions</h1>
        </div>
        <p className="text-navy-400 text-sm">
          {activeCount} question{activeCount !== 1 ? "s" : ""} tailored to your resume × job
          description pairing. Review them before starting.
        </p>
      </div>

      {/* ── Question Groups ── */}
      <div className="space-y-8 mb-10">
        {groupedQuestions.map(({ type, config, questions: groupQs }) => {
          const Icon = config.icon;
          const activeInGroup = groupQs.filter((q) => !q.isRemoved).length;

          return (
            <div key={type}>
              {/* Section Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`w-9 h-9 rounded-xl ${config.bgColor} flex items-center justify-center`}
                >
                  <Icon className={`w-4.5 h-4.5 ${config.color}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">{config.label}</h2>
                  <p className="text-xs text-navy-500">
                    {activeInGroup} of {groupQs.length} question
                    {groupQs.length !== 1 ? "s" : ""} active
                  </p>
                </div>
              </div>

              {/* Question Cards */}
              <div className="space-y-3">
                {groupQs.map((q, index) => (
                  <div
                    key={q.id}
                    className={`
                      glass-card p-5 transition-all duration-200 group
                      ${q.isRemoved ? "opacity-40" : ""}
                      ${!q.isRemoved ? "glass-card-hover" : ""}
                    `}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Question number + text */}
                        <div className="flex items-start gap-3">
                          <span
                            className={`
                              text-xs font-mono font-bold mt-0.5 flex-shrink-0
                              ${q.isRemoved ? "text-navy-600" : config.color}
                            `}
                          >
                            Q{index + 1}
                          </span>
                          <div>
                            <p
                              className={`
                                text-sm leading-relaxed
                                ${q.isRemoved ? "text-navy-500 line-through" : "text-navy-100"}
                              `}
                            >
                              {q.text}
                            </p>
                            {/* Rationale */}
                            <p className="text-xs text-navy-500 mt-2 italic">
                              {q.rationale}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Remove/Undo button */}
                      <button
                        onClick={() => toggleRemove(q.id, !q.isRemoved)}
                        disabled={togglingId === q.id}
                        className={`
                          flex-shrink-0 p-1.5 rounded-lg transition-all cursor-pointer
                          ${
                            q.isRemoved
                              ? "text-navy-500 hover:text-amber-500 hover:bg-amber-500/10"
                              : "text-navy-600 hover:text-alert hover:bg-alert/10 opacity-0 group-hover:opacity-100"
                          }
                        `}
                        aria-label={q.isRemoved ? "Restore question" : "Remove question"}
                        title={q.isRemoved ? "Restore this question" : "Remove this question"}
                      >
                        {togglingId === q.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : q.isRemoved ? (
                          <Undo2 className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Start Interview CTA ── */}
      <div className="flex flex-col items-center gap-3 pb-10">
        <Button
          variant="primary"
          size="lg"
          onClick={() => router.push(`/interview/${sessionId}`)}
          rightIcon={<ArrowRight className="w-4 h-4" />}
          disabled={activeCount === 0}
          className="min-w-[260px]"
        >
          Start Interview
        </Button>

        {activeCount === 0 && (
          <p className="text-xs text-alert">
            Restore at least one question to start the interview.
          </p>
        )}

        {activeCount > 0 && activeCount < questions.length && (
          <p className="text-xs text-navy-500">
            {questions.length - activeCount} question
            {questions.length - activeCount !== 1 ? "s" : ""} removed —
            you&apos;ll be asked {activeCount} question
            {activeCount !== 1 ? "s" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
