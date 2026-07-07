"use client";

import React from "react";
import { getScoreDescriptor } from "@/lib/scoring";

/**
 * OverallScore — large score display with plain-language summary.
 *
 * Score always appears with context — never a bare number.
 * Design: large circular score + subtitle summary text.
 */

interface OverallScoreProps {
  score: number;
  summary: string;
  label?: string;
}

export default function OverallScore({
  score,
  summary,
  label = "Overall Score",
}: OverallScoreProps) {
  const { tier } = getScoreDescriptor(score);

  const ringColors: Record<string, string> = {
    poor: "text-alert",
    below: "text-navy-400",
    good: "text-amber-500",
    great: "text-success",
    exceptional: "text-success",
  };

  const glowColors: Record<string, string> = {
    poor: "",
    below: "",
    good: "shadow-amber-500/10",
    great: "shadow-success/10",
    exceptional: "shadow-success/20",
  };

  const percentage = Math.min(100, (score / 10) * 100);
  const circumference = 2 * Math.PI * 52; // r=52
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="glass-card p-8 text-center">
      <p className="text-xs text-navy-500 uppercase tracking-wider font-medium mb-5">
        {label}
      </p>

      {/* Circular score ring */}
      <div
        className={`relative w-32 h-32 mx-auto mb-5 ${glowColors[tier] ? `shadow-xl ${glowColors[tier]}` : ""} rounded-full`}
      >
        <svg
          className="w-full h-full -rotate-90"
          viewBox="0 0 120 120"
        >
          {/* Background ring */}
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-navy-800"
          />
          {/* Score ring */}
          <circle
            cx="60"
            cy="60"
            r="52"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className={`${ringColors[tier]} transition-[stroke-dashoffset] duration-1000 ease-out`}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">{score}</span>
          <span className="text-sm text-navy-400 mt-2">/10</span>
        </div>
      </div>

      {/* Summary text — always provides context alongside the number */}
      <p className="text-sm text-navy-300 leading-relaxed max-w-sm mx-auto">
        {summary}
      </p>
    </div>
  );
}
