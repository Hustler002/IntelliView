"use client";

import React from "react";
import { Mic, Square } from "lucide-react";

/**
 * Large centered record/stop button with state-dependent appearance.
 *
 * - Idle: dark circle with mic icon, "Tap to answer"
 * - Recording: red pulsing circle with stop icon, "Stop recording"
 * - Disabled: when reviewing or submitting
 */

interface RecordButtonProps {
  isRecording: boolean;
  isDisabled: boolean;
  onRecord: () => void;
  onStop: () => void;
}

export default function RecordButton({
  isRecording,
  isDisabled,
  onRecord,
  onStop,
}: RecordButtonProps) {
  if (isRecording) {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* Persistent red recording indicator */}
        <div className="flex items-center gap-2 text-alert text-sm font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-alert animate-pulse" />
          Recording
        </div>

        <button
          onClick={onStop}
          className="w-20 h-20 rounded-full bg-alert flex items-center justify-center
                     shadow-lg shadow-alert/30 hover:bg-alert/90 transition-all
                     cursor-pointer active:scale-95"
          aria-label="Stop recording"
        >
          <Square className="w-7 h-7 text-white fill-white" />
        </button>

        <span className="text-xs text-navy-400">Tap to stop</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={onRecord}
        disabled={isDisabled}
        className="w-20 h-20 rounded-full bg-navy-700/60 border-2 border-navy-500/40
                   flex items-center justify-center transition-all cursor-pointer
                   hover:bg-navy-600/60 hover:border-amber-500/40 hover:shadow-lg
                   hover:shadow-amber-500/10 active:scale-95
                   disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-navy-700/60
                   disabled:hover:border-navy-500/40 disabled:hover:shadow-none"
        aria-label="Start recording"
      >
        <Mic className="w-8 h-8 text-navy-200" />
      </button>

      <span className="text-xs text-navy-400">
        {isDisabled ? "Submit or re-record" : "Tap to answer"}
      </span>
    </div>
  );
}
