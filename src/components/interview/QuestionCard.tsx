"use client";

import React from "react";

/**
 * QuestionCard — displays the current interview question with type badge
 * and progress indicator.
 *
 * Progress shows "Question 4 of 10" (not a percentage bar — candidates
 * shouldn't feel graded mid-flow).
 */

type QuestionType = "hr" | "technical" | "behavioral";

interface QuestionCardProps {
  questionText: string;
  questionType: QuestionType;
  currentIndex: number; // 0-based
  totalQuestions: number;
}

const TYPE_CONFIG: Record<QuestionType, { label: string; color: string }> = {
  hr: {
    label: "HR",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  technical: {
    label: "Technical",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  behavioral: {
    label: "Behavioral",
    color: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  },
};

export default function QuestionCard({
  questionText,
  questionType,
  currentIndex,
  totalQuestions,
}: QuestionCardProps) {
  const config = TYPE_CONFIG[questionType];

  return (
    <div className="glass-card p-6 sm:p-8">
      {/* Header: type badge + progress */}
      <div className="flex items-center justify-between mb-5">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}
        >
          {config.label}
        </span>

        <span className="text-sm text-navy-400">
          Question{" "}
          <span className="text-navy-200 font-medium">
            {currentIndex + 1}
          </span>{" "}
          of{" "}
          <span className="text-navy-200 font-medium">{totalQuestions}</span>
        </span>
      </div>

      {/* Question text */}
      <p className="text-lg sm:text-xl font-medium text-white leading-relaxed">
        {questionText}
      </p>
    </div>
  );
}
