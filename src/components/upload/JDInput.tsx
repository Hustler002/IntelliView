"use client";

import React, { useCallback, useState } from "react";
import { useDropzone, FileRejection } from "react-dropzone";
import {
  FileText,
  Upload,
  X,
  AlertCircle,
  Type,
  Paperclip,
} from "lucide-react";

/**
 * JDInput — job description input with toggle between paste-text and file-upload modes.
 *
 * For paste mode: a textarea with character count.
 * For file mode: a dropzone similar to ResumeDropzone.
 */

type InputMode = "text" | "file";

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};
const MAX_SIZE = 5 * 1024 * 1024;
const MIN_TEXT_LENGTH = 20;

interface JDInputProps {
  text: string;
  file: File | null;
  onTextChange: (text: string) => void;
  onFileSelect: (file: File | null) => void;
  error?: string;
}

export default function JDInput({
  text,
  file,
  onTextChange,
  onFileSelect,
  error: externalError,
}: JDInputProps) {
  const [mode, setMode] = useState<InputMode>("text");
  const [validationError, setValidationError] = useState<string | null>(null);

  const switchMode = (newMode: InputMode) => {
    setMode(newMode);
    setValidationError(null);
    // Clear the other input when switching
    if (newMode === "text") {
      onFileSelect(null);
    } else {
      onTextChange("");
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setValidationError(null);
      if (rejectedFiles.length > 0) {
        setValidationError("Only PDF and DOCX files are accepted, under 5MB");
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
    noClick: mode !== "file",
    noDrag: mode !== "file",
  });

  const displayError = externalError || validationError;
  const charCount = text.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-navy-200">
          Job Description
        </label>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-navy-800 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => switchMode("text")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              mode === "text"
                ? "bg-navy-600 text-navy-100"
                : "text-navy-400 hover:text-navy-200"
            }`}
          >
            <Type className="w-3 h-3" />
            Paste
          </button>
          <button
            type="button"
            onClick={() => switchMode("file")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              mode === "file"
                ? "bg-navy-600 text-navy-100"
                : "text-navy-400 hover:text-navy-200"
            }`}
          >
            <Paperclip className="w-3 h-3" />
            Upload
          </button>
        </div>
      </div>

      {mode === "text" ? (
        /* ── Text Paste Mode ── */
        <div>
          <textarea
            id="jd-text-input"
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste the full job description here — the more detail, the better your questions will be…"
            rows={8}
            className={`
              w-full px-4 py-3 rounded-xl
              bg-navy-800/50 border transition-all duration-200
              text-sm text-navy-100 placeholder-navy-500
              resize-y min-h-[120px]
              focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30
              ${displayError ? "border-alert/50" : "border-navy-600"}
            `}
          />
          <div className="flex justify-between mt-1.5">
            <p
              className={`text-xs ${
                charCount > 0 && charCount < MIN_TEXT_LENGTH
                  ? "text-amber-500"
                  : "text-navy-500"
              }`}
            >
              {charCount > 0 && charCount < MIN_TEXT_LENGTH
                ? `${MIN_TEXT_LENGTH - charCount} more characters needed`
                : "\u00A0"}
            </p>
            <p className="text-xs text-navy-500">{charCount} characters</p>
          </div>
        </div>
      ) : (
        /* ── File Upload Mode ── */
        <div
          {...getRootProps()}
          className={`
            dropzone p-8 text-center
            ${isDragActive ? "dropzone-active" : ""}
            ${displayError ? "dropzone-error" : ""}
            ${file ? "border-success/50 bg-success/5" : ""}
          `}
        >
          <input {...getInputProps()} id="jd-file-upload" />

          {file ? (
            <div className="flex items-center justify-center gap-3 animate-fade-in">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-success" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-navy-100 truncate max-w-[200px]">
                  {file.name}
                </p>
                <p className="text-xs text-navy-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileSelect(null);
                }}
                className="ml-2 p-1 rounded-full hover:bg-navy-700 transition-colors cursor-pointer"
                aria-label="Remove file"
              >
                <X className="w-4 h-4 text-navy-400" />
              </button>
            </div>
          ) : (
            <div>
              <div className="w-12 h-12 mx-auto rounded-xl bg-navy-800 flex items-center justify-center mb-3">
                <Upload
                  className={`w-6 h-6 ${
                    isDragActive ? "text-amber-500" : "text-navy-400"
                  }`}
                />
              </div>
              <p className="text-sm text-navy-200">
                <span className="text-amber-500 font-medium">
                  Click to upload
                </span>{" "}
                or drag your JD file
              </p>
              <p className="text-xs text-navy-500 mt-1">
                PDF or DOCX, up to 5MB
              </p>
            </div>
          )}
        </div>
      )}

      {displayError && (
        <div className="flex items-center gap-1.5 mt-2 text-alert text-xs animate-fade-in">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
