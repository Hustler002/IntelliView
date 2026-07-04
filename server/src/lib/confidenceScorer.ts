/**
 * Heuristic confidence scoring for spoken interview answers.
 *
 * This is the one score in the app that is NOT an LLM judgment call.
 * It's computed deterministically from measurable speech metrics:
 *   1. Words-per-minute (pace)
 *   2. Filler-word frequency
 *   3. Long-pause frequency (when word-level timestamps are available)
 *
 * Each dimension produces a 0-10 sub-score. The final confidence score
 * is a weighted average, clamped to [1, 10].
 *
 * ── Why these weights? ──────────────────────────────────────────────
 *
 *   fillerScore  × 0.40 — Strongest signal. Filler words are the most
 *                          reliable indicator of hesitation in speech,
 *                          and the most actionable feedback for candidates.
 *
 *   wpmScore     × 0.35 — Second strongest. Speaking too slowly signals
 *                          uncertainty; too fast signals nervousness.
 *                          Natural interview pace is 120-160 WPM.
 *
 *   pauseScore   × 0.25 — Third. Long pauses (>2s) indicate loss of
 *                          thought, but STT pause detection has lower
 *                          reliability than word-level metrics.
 *
 * All functions are pure — no side effects, no external dependencies.
 * This makes them trivially unit-testable.
 */

// ── Types ────────────────────────────────────────────────────────

export interface WordTimestamp {
  text: string;
  start: number; // seconds
  end: number; // seconds
}

export interface ConfidenceInput {
  transcript: string;
  durationSeconds: number;
  words?: WordTimestamp[]; // Optional — only available if STT provides timestamps
}

export interface ConfidenceBreakdown {
  confidenceScore: number; // 1-10, the final score
  wpmScore: number; // 0-10 sub-score
  fillerScore: number; // 0-10 sub-score
  pauseScore: number; // 0-10 sub-score
  metrics: {
    wpm: number;
    fillerCount: number;
    fillerRatio: number;
    longPauseCount: number;
    totalWords: number;
  };
}

// ── Constants ────────────────────────────────────────────────────

/**
 * Filler words matched as whole words (case-insensitive).
 *
 * Multi-word fillers ("you know", "sort of") are matched as bigrams.
 * Single-word entries use word-boundary matching to avoid false positives
 * (e.g., "likelihood" should NOT match "like").
 */
const SINGLE_WORD_FILLERS = ["um", "uh", "erm", "hmm", "basically", "actually", "literally"];

const MULTI_WORD_FILLERS = [
  "you know",
  "sort of",
  "kind of",
  "i mean",
  "like basically",
];

// "like" gets special treatment: only counted as filler when NOT preceded
// by a verb or "would"/"looks"/"feels" (e.g., "I like React" is not a filler,
// but "I was like thinking" is). Since we can't do full POS tagging, we
// use a simpler heuristic: "like" at the start of a sentence or after
// a comma/pause is a filler; mid-sentence "like" preceded by common
// non-filler contexts is skipped. For simplicity and defensibility in a
// portfolio project, we count standalone "like" when it appears as a
// discourse marker — i.e., not directly after "would", "i", "i'd", "don't",
// "didn't", "looks", "feels", or "sounds".
const LIKE_NON_FILLER_PREDECESSORS = new Set([
  "would", "i", "i'd", "don't", "didn't", "doesn't",
  "looks", "feels", "sounds", "seems", "really",
]);

/** Optimal WPM center for interview speech. */
const WPM_CENTER = 140;

/** Long pause threshold in seconds. */
const LONG_PAUSE_THRESHOLD = 2.0;

// ── Scoring Functions ────────────────────────────────────────────

/**
 * Count filler words in a transcript.
 *
 * Uses word-boundary-aware matching to avoid false positives.
 * Returns the raw count, not the ratio.
 */
export function countFillerWords(transcript: string): number {
  const normalized = transcript.toLowerCase();
  let count = 0;

  // Count multi-word fillers first (greedy — remove them to avoid double-counting)
  let remaining = normalized;
  for (const filler of MULTI_WORD_FILLERS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = remaining.match(regex);
    if (matches) {
      count += matches.length;
      remaining = remaining.replace(regex, " ");
    }
  }

  // Count single-word fillers with word boundaries
  for (const filler of SINGLE_WORD_FILLERS) {
    const regex = new RegExp(`\\b${filler}\\b`, "gi");
    const matches = remaining.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  // Count "like" as filler with context check
  const words = remaining.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    if (words[i].replace(/[^a-z]/g, "") === "like") {
      const predecessor = i > 0 ? words[i - 1].replace(/[^a-z']/g, "") : "";
      if (!LIKE_NON_FILLER_PREDECESSORS.has(predecessor)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Calculate words-per-minute from transcript and duration.
 *
 * Edge case: returns 0 if duration is 0 or negative (avoids division by zero).
 */
export function calculateWPM(transcript: string, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  return wordCount / (durationSeconds / 60);
}

/**
 * Count long pauses (gaps > LONG_PAUSE_THRESHOLD seconds) between words.
 *
 * Requires word-level timestamps from the STT provider.
 * Returns 0 if timestamps are not available.
 */
export function countLongPauses(words?: WordTimestamp[]): number {
  if (!words || words.length < 2) return 0;

  let pauseCount = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap > LONG_PAUSE_THRESHOLD) {
      pauseCount++;
    }
  }

  return pauseCount;
}

/**
 * Score WPM on a bell curve centered at WPM_CENTER (140 WPM).
 *
 * The curve uses a Gaussian-like penalty:
 *   score = 10 * exp(-(wpm - center)² / (2 * sigma²))
 *
 * sigma = 50 gives reasonable falloff:
 *   - 140 WPM → 10.0 (perfect)
 *   - 90 or 190 WPM → ~6.1 (moderate penalty)
 *   - 60 or 220 WPM → ~2.0 (heavy penalty)
 *   - 30 or 250 WPM → ~0.3 (near-zero)
 */
export function scoreWPM(wpm: number): number {
  if (wpm <= 0) return 0;
  const sigma = 50;
  const exponent = -Math.pow(wpm - WPM_CENTER, 2) / (2 * Math.pow(sigma, 2));
  return 10 * Math.exp(exponent);
}

/**
 * Score filler-word ratio on a linear scale.
 *
 *   0% fillers → 10 (perfect)
 *   2% → 8 (good)
 *   5% → 5 (moderate)
 *   10%+ → 0 (poor)
 *
 * Linear: score = 10 - (ratio * 100)
 */
export function scoreFillerRatio(fillerCount: number, totalWords: number): number {
  if (totalWords <= 0) return 10; // No words = no fillers = no penalty
  const ratio = fillerCount / totalWords;
  return Math.max(0, Math.min(10, 10 - ratio * 100));
}

/**
 * Score pause frequency on a linear scale.
 *
 * Normalized per minute of speech:
 *   0 pauses/min → 10 (perfect)
 *   2 pauses/min → 6 (moderate)
 *   5+ pauses/min → 0 (poor)
 *
 * Linear: score = 10 - (pausesPerMinute * 2)
 */
export function scorePauseFrequency(
  longPauseCount: number,
  durationSeconds: number
): number {
  if (durationSeconds <= 0) return 10;
  const pausesPerMinute = longPauseCount / (durationSeconds / 60);
  return Math.max(0, Math.min(10, 10 - pausesPerMinute * 2));
}

// ── Main Scoring Function ────────────────────────────────────────

/**
 * Compute the overall confidence score from transcript metrics.
 *
 * Formula:
 *   confidenceScore = round(
 *     0.35 * wpmScore +
 *     0.40 * fillerScore +
 *     0.25 * pauseScore
 *   )
 *
 * The result is clamped to [1, 10] — we never return 0 because even a
 * poor answer deserves a "1" rather than an undefined/zero state.
 */
export function computeConfidenceScore(input: ConfidenceInput): ConfidenceBreakdown {
  const { transcript, durationSeconds, words } = input;

  const totalWords = transcript.trim().split(/\s+/).filter(Boolean).length;
  const wpm = calculateWPM(transcript, durationSeconds);
  const fillerCount = countFillerWords(transcript);
  const fillerRatio = totalWords > 0 ? fillerCount / totalWords : 0;
  const longPauseCount = countLongPauses(words);

  const wpmSub = scoreWPM(wpm);
  const fillerSub = scoreFillerRatio(fillerCount, totalWords);
  const pauseSub = scorePauseFrequency(longPauseCount, durationSeconds);

  const raw = 0.35 * wpmSub + 0.40 * fillerSub + 0.25 * pauseSub;
  const confidenceScore = Math.max(1, Math.min(10, Math.round(raw)));

  return {
    confidenceScore,
    wpmScore: Math.round(wpmSub * 10) / 10,
    fillerScore: Math.round(fillerSub * 10) / 10,
    pauseScore: Math.round(pauseSub * 10) / 10,
    metrics: {
      wpm: Math.round(wpm),
      fillerCount,
      fillerRatio: Math.round(fillerRatio * 1000) / 1000,
      longPauseCount,
      totalWords,
    },
  };
}
