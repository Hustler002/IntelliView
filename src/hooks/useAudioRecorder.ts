"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * useAudioRecorder — full recording lifecycle with real-time waveform data.
 *
 * Uses MediaRecorder for audio capture and Web Audio API's AnalyserNode
 * for frequency data (driving a canvas-based waveform — not a CSS animation).
 *
 * Browser compatibility:
 *   - Chrome/Edge: audio/webm;codecs=opus ✅
 *   - Firefox: audio/webm;codecs=opus ✅
 *   - Safari 14.5+: audio/webm (limited) or audio/mp4 ⚠️
 *   - Safari < 14.5: No MediaRecorder — shows "unsupported" ❌
 *
 * The hook auto-detects the best supported MIME type at init.
 */

export type RecorderStatus =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "recording"
  | "stopped"
  | "error"
  | "unsupported";

const MAX_RECORDING_SECONDS = 180; // 3-minute soft cap
const COUNTDOWN_THRESHOLD = 30; // Show countdown in the last 30s

// Ordered by preference — Opus is smallest, WAV is universal fallback
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/wav",
];

function detectMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export interface UseAudioRecorderReturn {
  status: RecorderStatus;
  /** Detected MIME type for the recording */
  mimeType: string | null;
  /** Start recording (requests mic permission if not already granted) */
  start: () => Promise<void>;
  /** Stop recording */
  stop: () => void;
  /** Reset to idle (discard current recording) */
  reset: () => void;
  /** The recorded audio blob (available after stop) */
  blob: Blob | null;
  /** Duration of the recording in seconds */
  durationSeconds: number;
  /** Elapsed seconds while recording (live counter) */
  elapsedSeconds: number;
  /** Seconds remaining until max length */
  remainingSeconds: number;
  /** Whether countdown should be visible (last 30s) */
  showCountdown: boolean;
  /** Frequency data array for waveform visualization (updated each animation frame) */
  frequencyData: Uint8Array;
  /** Error message if something went wrong */
  error: string | null;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(
    () => new Uint8Array(64)
  );
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup-safe access inside callbacks
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);

  const mimeType = useRef(detectMimeType()).current;

  // Check MediaRecorder support on mount
  useEffect(() => {
    if (!mimeType) {
      setStatus("unsupported");
      setError(
        "Your browser doesn't support audio recording. Please use Chrome, Firefox, or Safari 14.5+."
      );
    }
  }, [mimeType]);

  // ── Waveform Animation Loop ────────────────────────────────────
  const startWaveformAnimation = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);
      // Create a new array each frame so React detects the change
      setFrequencyData(new Uint8Array(dataArray));
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, []);

  const stopWaveformAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // ── Timer ──────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    setElapsedSeconds(0);

    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);

      // Auto-stop at max recording length
      if (elapsed >= MAX_RECORDING_SECONDS) {
        // Use the ref directly to avoid stale closure over `stop`
        mediaRecorderRef.current?.stop();
      }
    }, 200); // 200ms precision is fine for a UI counter
  }, []);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────
  const cleanupAudioResources = useCallback(() => {
    stopWaveformAnimation();
    stopTimer();

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, [stopWaveformAnimation, stopTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioResources();
    };
  }, [cleanupAudioResources]);

  // ── Start Recording ────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!mimeType) {
      setError("Audio recording is not supported in this browser.");
      setStatus("error");
      return;
    }

    setError(null);
    setBlob(null);
    chunksRef.current = [];

    try {
      setStatus("requesting_permission");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });

      mediaStreamRef.current = stream;

      // Set up Web Audio API for waveform visualization
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // 64 frequency bins — enough for a smooth waveform
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, { type: mimeType });
        setBlob(recordedBlob);
        setDurationSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000)
        );
        setStatus("stopped");
        stopWaveformAnimation();
        stopTimer();
      };

      recorder.onerror = () => {
        setError("Recording failed unexpectedly. Please try again.");
        setStatus("error");
        cleanupAudioResources();
      };

      // Start recording — collect data every 1 second
      recorder.start(1000);
      setStatus("recording");
      startWaveformAnimation();
      startTimer();
    } catch (err) {
      cleanupAudioResources();

      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setError(
            "Microphone access was denied. Please allow microphone access in your browser settings and try again."
          );
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setError(
            "No microphone found. Please connect a microphone and try again."
          );
        } else {
          setError(`Microphone error: ${err.message}`);
        }
      } else {
        setError("Failed to start recording. Please try again.");
      }

      setStatus("error");
    }
  }, [
    mimeType,
    startWaveformAnimation,
    stopWaveformAnimation,
    startTimer,
    stopTimer,
    cleanupAudioResources,
  ]);

  // ── Stop Recording ─────────────────────────────────────────────
  const stop = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      // onstop handler will update state
    }
  }, []);

  // ── Reset ──────────────────────────────────────────────────────
  const reset = useCallback(() => {
    cleanupAudioResources();
    setBlob(null);
    setDurationSeconds(0);
    setElapsedSeconds(0);
    setFrequencyData(new Uint8Array(64));
    setError(null);
    chunksRef.current = [];
    setStatus("idle");
  }, [cleanupAudioResources]);

  const remainingSeconds = MAX_RECORDING_SECONDS - elapsedSeconds;
  const showCountdown =
    status === "recording" && remainingSeconds <= COUNTDOWN_THRESHOLD;

  return {
    status,
    mimeType,
    start,
    stop,
    reset,
    blob,
    durationSeconds,
    elapsedSeconds,
    remainingSeconds,
    showCountdown,
    frequencyData,
    error,
  };
}
