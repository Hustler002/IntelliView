"use client";

import React, { useRef, useEffect, useCallback } from "react";

/**
 * Canvas-based real-time waveform visualization.
 *
 * Renders frequency data from the Web Audio API AnalyserNode as vertical
 * bars. Uses requestAnimationFrame via the parent component (which passes
 * updated frequencyData each frame).
 *
 * This is NOT a CSS animation — it's driven by actual audio frequency data.
 */

interface WaveformProps {
  /** Uint8Array of frequency data from the AnalyserNode (0-255 per bin) */
  frequencyData: Uint8Array;
  /** Whether audio is actively recording */
  isRecording: boolean;
  /** Bar color when recording (defaults to amber) */
  activeColor?: string;
  /** Bar color when idle (defaults to navy) */
  idleColor?: string;
  /** Canvas height in pixels */
  height?: number;
  className?: string;
}

export default function Waveform({
  frequencyData,
  isRecording,
  activeColor = "#E8A33D",
  idleColor = "#3D5A80",
  height = 80,
  className = "",
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const canvasHeight = rect.height;

    // Clear
    ctx.clearRect(0, 0, width, canvasHeight);

    const bars = frequencyData.length;
    const barWidth = Math.max(2, (width / bars) * 0.6);
    const gap = (width - barWidth * bars) / (bars - 1 || 1);
    const color = isRecording ? activeColor : idleColor;

    for (let i = 0; i < bars; i++) {
      const value = frequencyData[i] / 255;
      // Minimum bar height of 3px so the waveform is visible even in silence
      const barHeight = Math.max(3, value * canvasHeight * 0.9);
      const x = i * (barWidth + gap);
      const y = (canvasHeight - barHeight) / 2;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6 + value * 0.4; // Brighter bars for louder frequencies
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }, [frequencyData, isRecording, activeColor, idleColor]);

  // Redraw whenever frequencyData changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Handle resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      draw();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: `${height}px` }}
        className="rounded-lg"
      />
    </div>
  );
}
