"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw, Send } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Audio playback component for reviewing recorded answers before submission.
 *
 * Shows play/pause + progress bar + re-record and submit buttons.
 * Uses an <audio> element with a blob URL — no network requests.
 */

interface AudioPlaybackProps {
  blob: Blob;
  durationSeconds: number;
  onReRecord: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudioPlayback({
  blob,
  durationSeconds,
  onReRecord,
  onSubmit,
  isSubmitting,
}: AudioPlaybackProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Create and clean up blob URL
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const progress =
    durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* Audio element (hidden — controlled via refs) */}
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}

      {/* Playback controls */}
      <div className="glass-card p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlayback}
            className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center
                       hover:bg-amber-500/30 transition-colors cursor-pointer"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 text-amber-500" />
            ) : (
              <Play className="w-4 h-4 text-amber-500 ml-0.5" />
            )}
          </button>

          <div className="flex-1">
            {/* Progress bar */}
            <div className="relative h-1.5 bg-navy-700 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-amber-500 rounded-full transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={durationSeconds}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
              style={{ position: "absolute", top: 0, left: 0 }}
              aria-label="Seek"
            />
          </div>

          <span className="text-xs text-navy-400 font-mono tabular-nums min-w-[5ch] text-right">
            {formatTime(currentTime)} / {formatTime(durationSeconds)}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 justify-center">
        <Button
          variant="secondary"
          onClick={onReRecord}
          disabled={isSubmitting}
          leftIcon={<RotateCcw className="w-4 h-4" />}
        >
          Re-record
        </Button>

        <Button
          variant="primary"
          onClick={onSubmit}
          isLoading={isSubmitting}
          leftIcon={<Send className="w-4 h-4" />}
        >
          Submit Answer
        </Button>
      </div>
    </div>
  );
}
