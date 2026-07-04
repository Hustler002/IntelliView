"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import QuestionCard from "@/components/interview/QuestionCard";
import RecordButton from "@/components/interview/RecordButton";
import Waveform from "@/components/interview/Waveform";
import AudioPlayback from "@/components/interview/AudioPlayback";
import MicPermissionGate from "@/components/interview/MicPermissionGate";

/**
 * Live interview page — one question at a time, record → review → submit.
 *
 * Flow:
 *   1. Fetch all questions on mount
 *   2. Show MicPermissionGate (first time only)
 *   3. For each question: record → stop → review playback → submit or re-record
 *   4. On submit: upload audio blob to /api/interview/[sessionId]/answer
 *   5. After last question: redirect to /interview/[sessionId]/processing
 *
 * Evaluation is async — we never block the UI waiting for transcription.
 */

interface QuestionData {
  id: string;
  type: "hr" | "technical" | "behavioral";
  text: string;
  order: number;
}

export default function LiveInterviewPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  // Questions state
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Mic permission state
  const [micGranted, setMicGranted] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const recorder = useAudioRecorder();
  const currentQuestion = questions[currentIndex];

  // ── Fetch Questions ────────────────────────────────────────────
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch(`/api/interview/${sessionId}/questions`);
        const data = await res.json();

        if (!res.ok) {
          setLoadError(data.error || "Failed to load questions");
          return;
        }

        setQuestions(data.questions);

        // Update session status to in_progress if needed (first visit)
      } catch {
        setLoadError("Network error. Please check your connection.");
      } finally {
        setIsLoadingQuestions(false);
      }
    }

    fetchQuestions();
  }, [sessionId]);

  // ── Handle Mic Permission ─────────────────────────────────────
  const handleMicAllow = useCallback(async () => {
    await recorder.start();
    // If recording started successfully, mic is granted
    if (recorder.status === "recording") {
      setMicGranted(true);
      recorder.stop(); // Stop the test recording
      recorder.reset();
    }
  }, [recorder]);

  // Track when permission is granted via the recorder status
  useEffect(() => {
    if (recorder.status === "recording" && !micGranted) {
      setMicGranted(true);
      // Stop the permission-check recording
      recorder.stop();
      setTimeout(() => recorder.reset(), 100);
    }
  }, [recorder.status, micGranted, recorder]);

  // ── Handle Recording ──────────────────────────────────────────
  const handleStartRecording = async () => {
    setSubmitError(null);
    await recorder.start();
  };

  const handleStopRecording = () => {
    recorder.stop();
  };

  // ── Handle Submit ─────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!recorder.blob || !currentQuestion) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formData = new FormData();
      formData.append("audio", recorder.blob, `answer.${recorder.mimeType?.includes("webm") ? "webm" : "wav"}`);
      formData.append("questionId", currentQuestion.id);
      formData.append("durationSeconds", String(recorder.durationSeconds));
      formData.append("mimeType", recorder.mimeType || "audio/webm");

      const res = await fetch(`/api/interview/${sessionId}/answer`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Failed to submit answer");
        return;
      }

      // Clean up recorder state
      recorder.reset();

      if (data.isLastQuestion) {
        // All questions answered — redirect to processing
        router.push(`/interview/${sessionId}/processing`);
      } else {
        // Advance to next question
        setCurrentIndex((prev) => prev + 1);
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Handle Re-record ──────────────────────────────────────────
  const handleReRecord = () => {
    recorder.reset();
    setSubmitError(null);
  };

  // ── Loading State ─────────────────────────────────────────────
  if (isLoadingQuestions) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <AlertCircle className="w-12 h-12 text-alert mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          Couldn&apos;t load questions
        </h2>
        <p className="text-navy-400 text-sm mb-6">{loadError}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-amber-500 hover:text-amber-400 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <h2 className="text-xl font-bold text-white mb-2">No questions yet</h2>
        <p className="text-navy-400 text-sm">
          Questions are still being generated. Please go back and wait for them
          to be ready.
        </p>
      </div>
    );
  }

  // ── Mic Permission Gate ────────────────────────────────────────
  if (!micGranted && recorder.status !== "recording") {
    return (
      <MicPermissionGate
        onAllow={handleMicAllow}
        error={recorder.error}
        isRequesting={recorder.status === "requesting_permission"}
      />
    );
  }

  // ── Browser Not Supported ──────────────────────────────────────
  if (recorder.status === "unsupported") {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <AlertCircle className="w-12 h-12 text-alert mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">
          Browser not supported
        </h2>
        <p className="text-navy-400 text-sm">
          {recorder.error}
        </p>
      </div>
    );
  }

  // ── Main Interview Flow ────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-8 animate-fade-in">
      {/* Question */}
      <QuestionCard
        questionText={currentQuestion.text}
        questionType={currentQuestion.type}
        currentIndex={currentIndex}
        totalQuestions={questions.length}
      />

      {/* Recording Area */}
      <div className="mt-8 space-y-6">
        {/* Waveform — visible during recording */}
        {recorder.status === "recording" && (
          <div className="animate-fade-in">
            <Waveform
              frequencyData={recorder.frequencyData}
              isRecording={true}
              height={80}
            />
          </div>
        )}

        {/* Timer — visible during recording */}
        {recorder.status === "recording" && (
          <div className="text-center">
            <span className="font-mono text-2xl text-white tabular-nums">
              {Math.floor(recorder.elapsedSeconds / 60)}:
              {(recorder.elapsedSeconds % 60).toString().padStart(2, "0")}
            </span>

            {/* Countdown warning in last 30 seconds */}
            {recorder.showCountdown && (
              <p className="text-alert text-xs mt-1 animate-pulse">
                {recorder.remainingSeconds}s remaining
              </p>
            )}
          </div>
        )}

        {/* Record/Stop button — hidden after recording stops (replaced by playback) */}
        {recorder.status !== "stopped" && (
          <div className="flex justify-center">
            <RecordButton
              isRecording={recorder.status === "recording"}
              isDisabled={
                isSubmitting || recorder.status === "requesting_permission"
              }
              onRecord={handleStartRecording}
              onStop={handleStopRecording}
            />
          </div>
        )}

        {/* Playback + submit — shown after recording stops */}
        {recorder.status === "stopped" && recorder.blob && (
          <div className="animate-fade-in">
            <AudioPlayback
              blob={recorder.blob}
              durationSeconds={recorder.durationSeconds}
              onReRecord={handleReRecord}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {/* Submit error */}
        {submitError && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-alert/10 border border-alert/20 text-alert text-sm animate-fade-in max-w-md mx-auto">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Recorder error (not permission-related) */}
        {recorder.error &&
          !recorder.error.includes("denied") &&
          recorder.status === "error" && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-alert/10 border border-alert/20 text-alert text-sm animate-fade-in max-w-md mx-auto">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{recorder.error}</span>
            </div>
          )}
      </div>
    </div>
  );
}
