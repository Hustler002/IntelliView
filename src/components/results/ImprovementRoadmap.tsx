"use client";

import React from "react";
import { Loader2, Target, Sparkles } from "lucide-react";

/**
 * ImprovementRoadmap — displays the LLM-synthesized prioritized action items.
 *
 * 3-5 concrete, specific action items — not a re-listing of per-question notes.
 * Shows a loading state while the synthesis LLM call is in progress.
 */

interface ImprovementRoadmapProps {
  items: string[] | null;
  isLoading: boolean;
  onGenerate: () => void;
}

export default function ImprovementRoadmap({
  items,
  isLoading,
  onGenerate,
}: ImprovementRoadmapProps) {
  // Not yet generated — prompt the user
  if (!items && !isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-semibold text-white">Improvement Roadmap</h3>
        </div>
        <p className="text-sm text-navy-400 mb-4">
          Get a prioritized action plan synthesized from all your feedback.
        </p>
        <button
          onClick={onGenerate}
          className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Generate Roadmap
        </button>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <h3 className="font-semibold text-white">Improvement Roadmap</h3>
        </div>
        <div className="flex items-center gap-2 text-sm text-navy-400">
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
          Synthesizing your feedback into actionable steps…
        </div>
      </div>
    );
  }

  // Roadmap items
  return (
    <div className="glass-card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Target className="w-4 h-4 text-amber-500" />
        </div>
        <h3 className="font-semibold text-white">Improvement Roadmap</h3>
      </div>

      <ol className="space-y-3">
        {items?.map((item, i) => (
          <li key={i} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              {i + 1}
            </span>
            <p className="text-sm text-navy-300 leading-relaxed">{item}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
