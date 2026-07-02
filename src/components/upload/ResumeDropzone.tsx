"use client";

import React, { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import { Upload, FileText, X, AlertCircle } from "lucide-react";

/**
 * ResumeDropzone — drag-and-drop file picker for resume uploads.
 *
 * Validates file type (PDF/DOCX only) and size (5MB max) client-side.
 * The server re-validates with magic bytes — this is just for UX speed.
 */

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

interface ResumeDropzoneProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  error?: string;
}

export default function ResumeDropzone({
  file,
  onFileSelect,
  error: externalError,
}: ResumeDropzoneProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setValidationError(null);

      if (rejectedFiles.length > 0) {
        const err = rejectedFiles[0].errors[0];
        if (err.message.includes("type")) {
          setValidationError("Only PDF and DOCX files are accepted");
        } else {
          setValidationError("File must be under 5MB");
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
  });

  const displayError = externalError || validationError;

  const removeFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFileSelect(null);
    setValidationError(null);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-navy-200 mb-2">
        Resume
      </label>

      <div
        {...getRootProps()}
        className={`
          dropzone p-8 text-center transition-all duration-200
          ${isDragActive ? "dropzone-active" : ""}
          ${displayError ? "dropzone-error" : ""}
          ${file ? "border-success/50 bg-success/5" : ""}
        `}
      >
        <input {...getInputProps()} id="resume-upload" />

        {file ? (
          /* ── File Selected State ── */
          <div className="flex items-center justify-center gap-3 animate-fade-in">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-success" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-navy-100 truncate max-w-[200px]">
                {file.name}
              </p>
              <p className="text-xs text-navy-400">
                {(file.size / 1024).toFixed(0)} KB •{" "}
                {file.type.includes("pdf") ? "PDF" : "DOCX"}
              </p>
            </div>
            <button
              onClick={removeFile}
              className="ml-2 p-1 rounded-full hover:bg-navy-700 transition-colors cursor-pointer"
              aria-label="Remove file"
            >
              <X className="w-4 h-4 text-navy-400" />
            </button>
          </div>
        ) : (
          /* ── Empty/Drag State ── */
          <div>
            <div className="w-12 h-12 mx-auto rounded-xl bg-navy-800 flex items-center justify-center mb-3">
              <Upload
                className={`w-6 h-6 transition-colors ${
                  isDragActive ? "text-amber-500" : "text-navy-400"
                }`}
              />
            </div>
            <p className="text-sm text-navy-200">
              {isDragActive ? (
                <span className="text-amber-500 font-medium">
                  Drop your resume here
                </span>
              ) : (
                <>
                  <span className="text-amber-500 font-medium cursor-pointer hover:underline">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </>
              )}
            </p>
            <p className="text-xs text-navy-500 mt-1">
              PDF or DOCX, up to 5MB
            </p>
          </div>
        )}
      </div>

      {displayError && (
        <div className="flex items-center gap-1.5 mt-2 text-alert text-xs animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
