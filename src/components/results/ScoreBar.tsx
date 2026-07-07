"use client";

import React from "react";
import { getScoreDescriptor } from "@/lib/scoring";

/**
 * ScoreBar — a simple styled div bar with score + plain-language descriptor.
 *
 * Not a chart library — just a colored div that fills proportionally.
 * Every score is paired with a descriptor ("7/10 — good"), never bare.
 */

interface ScoreBarProps {
  label: string;
  score: number;
  maxScore?: number;
}

const TIER_COLORS: Record<string, string> = {
  poor: "bg-alert",
  below: "bg-navy-400",
  good: "bg-amber-500",
  great: "bg-success",
  exceptional: "bg-success",
};

const TIER_BG: Record<string, string> = {
  poor: "bg-alert/10",
  below: "bg-navy-700",
  good: "bg-amber-500/10",
  great: "bg-success/10",
  exceptional: "bg-success/10",
};

const TIER_TEXT: Record<string, string> = {
  poor: "text-alert",
  below: "text-navy-400",
  good: "text-amber-500",
  great: "text-success",
  exceptional: "text-success",
};

export default function ScoreBar({
  label,
  score,
  maxScore = 10,
}: ScoreBarProps) {
  const percentage = Math.min(100, (score / maxScore) * 100);
  const { label: descriptor, tier } = getScoreDescriptor(score);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-navy-300 font-medium">{label}</span>
        <span className={`font-semibold ${TIER_TEXT[tier]}`}>
          {score}/{maxScore}{" "}
          <span className="font-normal text-xs opacity-75">
            — {descriptor.toLowerCase()}
          </span>
        </span>
      </div>
      <div className={`h-2 rounded-full ${TIER_BG[tier]} overflow-hidden`}>
        <div
          className={`h-full rounded-full ${TIER_COLORS[tier]} transition-[width] duration-700 ease-out ${
            tier === "exceptional" ? "shadow-sm shadow-success/40" : ""
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
