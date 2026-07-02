"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, AlertCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import ResumeDropzone from "@/components/upload/ResumeDropzone";
import JDInput from "@/components/upload/JDInput";

/**
 * Upload page — side-by-side resume + JD input zones.
 *
 * Stacks vertically on mobile. "Generate My Interview" button is
 * disabled until both inputs are present. On submit, uploads to
 * /api/upload and redirects to the waiting screen.
 */

export default function UploadPage() {
  const router = useRouter();

  // Resume state
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState("");

  // JD state
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [jdError, setJdError] = useState("");

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Validation: both inputs must be present
  const hasResume = !!resumeFile;
  const hasJD = jdText.trim().length >= 20 || !!jdFile;
  const canSubmit = hasResume && hasJD && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setSubmitError("");
    setResumeError("");
    setJdError("");

    try {
      const formData = new FormData();
      formData.append("resumeFile", resumeFile!);

      if (jdFile) {
        formData.append("jdFile", jdFile);
      } else {
        formData.append("jdText", jdText);
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || "Upload failed. Please try again.");
        return;
      }

      // Navigate to the waiting/preparing screen
      router.push(`/interview/${data.sessionId}/preparing`);
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h1 className="text-2xl font-bold text-white">New Interview Session</h1>
        </div>
        <p className="text-navy-400">
          Upload your resume and the job description. We&apos;ll generate
          interview questions tailored to this specific pairing.
        </p>
      </div>

      {/* ── Upload Zones ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Resume Zone */}
        <div className="glass-card p-6">
          <ResumeDropzone
            file={resumeFile}
            onFileSelect={(file) => {
              setResumeFile(file);
              setResumeError("");
            }}
            error={resumeError}
          />
        </div>

        {/* JD Zone */}
        <div className="glass-card p-6">
          <JDInput
            text={jdText}
            file={jdFile}
            onTextChange={(text) => {
              setJdText(text);
              setJdError("");
            }}
            onFileSelect={(file) => {
              setJdFile(file);
              setJdError("");
            }}
            error={jdError}
          />
        </div>
      </div>

      {/* ── Submit Error ── */}
      {submitError && (
        <div className="flex items-center gap-2 p-4 mb-6 rounded-xl bg-alert/10 border border-alert/20 text-alert text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* ── Submit Button ── */}
      <div className="flex flex-col items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={isSubmitting}
          rightIcon={<ArrowRight className="w-4 h-4" />}
          className="min-w-[280px]"
        >
          Generate My Interview
        </Button>

        {!canSubmit && !isSubmitting && (
          <p className="text-xs text-navy-500">
            {!hasResume && !hasJD
              ? "Upload a resume and add a job description to continue"
              : !hasResume
                ? "Upload your resume to continue"
                : "Add a job description (at least 20 characters) to continue"}
          </p>
        )}
      </div>
    </div>
  );
}
