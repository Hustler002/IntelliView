"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import ScoreBar from "./ScoreBar";

/**
 * QuestionAccordion — expandable card showing per-question evaluation.
 *
 * Collapsed: question text + type badge + average score
 * Expanded: transcript, three score bars, feedback, improvement note
 */

interface QuestionAccordionProps {
  questionText: string;
  questionType: "hr" | "technical" | "behavioral";
  order: number;
  transcript: string | null;
  correctnessScore: number;
  communicationScore: number;
  confidenceScore: number;
  feedback: string;
  improvementNotes: string;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
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

export default function QuestionAccordion({
  questionText,
  questionType,
  order,
  transcript,
  correctnessScore,
  communicationScore,
  confidenceScore,
  feedback,
  improvementNotes,
}: QuestionAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = TYPE_CONFIG[questionType] || TYPE_CONFIG.hr;
  const avgScore = Math.round(
    ((correctnessScore + communicationScore + confidenceScore) / 3) * 10
  ) / 10;

  return (
    <div className="glass-card overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="text-sm text-navy-500 font-mono w-6 flex-shrink-0">
          {order}.
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">{questionText}</p>
        </div>

        <span
          className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${config.color} flex-shrink-0`}
        >
          {config.label}
        </span>

        <span className="text-sm font-semibold text-amber-500 w-12 text-right flex-shrink-0">
          {avgScore}
        </span>

        <ChevronDown
          className={`w-4 h-4 text-navy-400 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-5 pb-5 pt-0 border-t border-white/5 animate-fade-in">
          {/* Transcript */}
          {transcript && (
            <div className="mt-4 mb-5">
              <h4 className="text-xs text-navy-500 uppercase tracking-wider font-medium mb-2">
                Your Answer
              </h4>
              <p className="text-sm text-navy-300 leading-relaxed bg-navy-900/50 rounded-lg p-4 italic">
                &ldquo;{transcript}&rdquo;
              </p>
            </div>
          )}

          {/* Score bars */}
          <div className="space-y-3 mb-5">
            <ScoreBar label="Correctness" score={correctnessScore} />
            <ScoreBar label="Communication" score={communicationScore} />
            <ScoreBar label="Confidence" score={confidenceScore} />
          </div>

          {/* Feedback */}
          <div className="mb-4">
            <h4 className="text-xs text-navy-500 uppercase tracking-wider font-medium mb-2">
              Feedback
            </h4>
            <p className="text-sm text-navy-300 leading-relaxed">{feedback}</p>
          </div>

          {/* Improvement note */}
          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <h4 className="text-xs text-amber-500 uppercase tracking-wider font-medium mb-1.5">
              How to improve
            </h4>
            <p className="text-sm text-navy-300 leading-relaxed">
              {improvementNotes}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
