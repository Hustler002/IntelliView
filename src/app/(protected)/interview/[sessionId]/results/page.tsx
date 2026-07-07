"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import Button from "@/components/ui/Button";
import OverallScore from "@/components/results/OverallScore";
import ImprovementRoadmap from "@/components/results/ImprovementRoadmap";
import QuestionAccordion from "@/components/results/QuestionAccordion";
import ScoreBar from "@/components/results/ScoreBar";

/**
 * Results page — full evaluation breakdown for a completed session.
 *
 * Shows: overall score with plain-language summary, per-dimension averages,
 * improvement roadmap (LLM-synthesized), expandable per-question breakdown,
 * and a "Retry this JD" button.
 */

interface QuestionResult {
  questionId: string;
  text: string;
  type: "hr" | "technical" | "behavioral";
  order: number;
  transcript: string | null;
  correctnessScore: number;
  communicationScore: number;
  confidenceScore: number;
  feedback: string;
  improvementNotes: string;
}

interface ResultsData {
  session: {
    id: string;
    status: string;
    createdAt: string;
    resumeProfileId: string;
    jobDescriptionId: string;
  };
  jd: { role: string; seniority: string };
  scores: {
    overall: number;
    correctness: number;
    communication: number;
    confidence: number;
  };
  summary: string;
  questions: QuestionResult[];
  improvementRoadmap: string[] | null;
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [data, setData] = useState<ResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Roadmap state
  const [roadmap, setRoadmap] = useState<string[] | null>(null);
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);

  // Retry state
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch results
  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch(`/api/interview/${sessionId}/results`);
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Failed to load results");
          return;
        }
        setData(json);
        setRoadmap(json.improvementRoadmap);
      } catch {
        setError("Network error. Please check your connection.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchResults();
  }, [sessionId]);

  // Generate roadmap
  const handleGenerateRoadmap = useCallback(async () => {
    setIsGeneratingRoadmap(true);
    try {
      const res = await fetch(`/api/interview/${sessionId}/roadmap`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        setRoadmap(json.roadmap);
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setIsGeneratingRoadmap(false);
    }
  }, [sessionId]);

  // Retry this JD
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch(`/api/interview/${sessionId}/retry`, {
        method: "POST",
      });
      const json = await res.json();
      if (res.ok) {
        router.push(`/interview/${json.newSessionId}/preparing`);
      }
    } catch {
      setIsRetrying(false);
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <AlertCircle className="w-12 h-12 text-alert mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          Couldn&apos;t load results
        </h2>
        <p className="text-navy-400 text-sm mb-6">{error}</p>
        <Link href="/dashboard" className="text-amber-500 hover:text-amber-400 text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-4 sm:py-8 animate-fade-in">
      {/* Back link + header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard"
          className="text-navy-400 hover:text-navy-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Interview Results</h1>
          <p className="text-sm text-navy-400">
            {data.jd.role} · {data.jd.seniority} ·{" "}
            {new Date(data.session.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Overall score */}
      <div className="mb-8">
        <OverallScore score={data.scores.overall} summary={data.summary} />
      </div>

      {/* Per-dimension scores */}
      <div className="glass-card p-6 mb-8 space-y-4">
        <h3 className="text-sm text-navy-500 uppercase tracking-wider font-medium mb-3">
          Score Breakdown
        </h3>
        <ScoreBar label="Technical Correctness" score={data.scores.correctness} />
        <ScoreBar label="Communication Clarity" score={data.scores.communication} />
        <ScoreBar label="Confidence" score={data.scores.confidence} />
      </div>

      {/* Improvement roadmap */}
      <div className="mb-8">
        <ImprovementRoadmap
          items={roadmap}
          isLoading={isGeneratingRoadmap}
          onGenerate={handleGenerateRoadmap}
        />
      </div>

      {/* Per-question breakdown */}
      <div className="mb-8">
        <h3 className="text-sm text-navy-500 uppercase tracking-wider font-medium mb-4">
          Per-Question Breakdown
        </h3>
        <div className="space-y-2">
          {data.questions.map((q) => (
            <QuestionAccordion
              key={q.questionId}
              questionText={q.text}
              questionType={q.type}
              order={q.order}
              transcript={q.transcript}
              correctnessScore={q.correctnessScore}
              communicationScore={q.communicationScore}
              confidenceScore={q.confidenceScore}
              feedback={q.feedback}
              improvementNotes={q.improvementNotes}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 pb-8">
        <Button
          variant="primary"
          onClick={handleRetry}
          isLoading={isRetrying}
          leftIcon={<RotateCcw className="w-4 h-4" />}
        >
          Retry this JD
        </Button>
        <Link href="/dashboard">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
