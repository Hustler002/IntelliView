/**
 * Scoring utilities for the results dashboard.
 *
 * Handles score averaging, plain-language descriptors, and summary generation.
 * Scores are always 1-10 across three dimensions: correctness, communication, confidence.
 */

export interface ScoreSet {
  correctnessScore: number;
  communicationScore: number;
  confidenceScore: number;
}

export interface AggregatedScores {
  overall: number;
  correctness: number;
  communication: number;
  confidence: number;
}

/**
 * Calculate average scores across multiple evaluations.
 * Returns per-dimension averages and an overall average.
 */
export function aggregateScores(evaluations: ScoreSet[]): AggregatedScores {
  if (evaluations.length === 0) {
    return { overall: 0, correctness: 0, communication: 0, confidence: 0 };
  }

  const sum = evaluations.reduce(
    (acc, e) => ({
      correctness: acc.correctness + e.correctnessScore,
      communication: acc.communication + e.communicationScore,
      confidence: acc.confidence + e.confidenceScore,
    }),
    { correctness: 0, communication: 0, confidence: 0 }
  );

  const n = evaluations.length;
  const correctness = round(sum.correctness / n);
  const communication = round(sum.communication / n);
  const confidence = round(sum.confidence / n);
  const overall = round((correctness + communication + confidence) / 3);

  return { overall, correctness, communication, confidence };
}

/**
 * Get a plain-language descriptor for a score.
 * Scores are never shown as bare numbers — always paired with context.
 */
export function getScoreDescriptor(score: number): {
  label: string;
  tier: "poor" | "below" | "good" | "great" | "exceptional";
} {
  if (score >= 10) return { label: "Exceptional", tier: "exceptional" };
  if (score >= 8) return { label: "Very good", tier: "great" };
  if (score >= 6) return { label: "Good", tier: "good" };
  if (score >= 4) return { label: "Below average", tier: "below" };
  return { label: "Needs work", tier: "poor" };
}

/**
 * Generate a one-line summary combining the overall score with context.
 * e.g. "7.2/10 — strong technical answers, work on confidence"
 */
export function generateScoreSummary(scores: AggregatedScores): string {
  const { overall, correctness, communication, confidence } = scores;

  if (overall === 0) return "No scores available yet.";

  // Find strongest and weakest dimensions
  const dims = [
    { name: "technical accuracy", score: correctness },
    { name: "communication", score: communication },
    { name: "confidence", score: confidence },
  ];

  dims.sort((a, b) => b.score - a.score);
  const strongest = dims[0];
  const weakest = dims[dims.length - 1];

  // Build the summary
  const descriptor = getScoreDescriptor(overall);

  if (overall >= 8) {
    return `${overall}/10 — ${descriptor.label.toLowerCase()}. Strong across all dimensions, especially ${strongest.name}.`;
  }

  if (overall >= 6) {
    return `${overall}/10 — ${descriptor.label.toLowerCase()}. Good ${strongest.name}, could improve ${weakest.name}.`;
  }

  if (overall >= 4) {
    return `${overall}/10 — ${descriptor.label.toLowerCase()}. Best in ${strongest.name}, focus on strengthening ${weakest.name}.`;
  }

  return `${overall}/10 — ${descriptor.label.toLowerCase()}. Focus on ${weakest.name} and ${dims[1].name} for the biggest improvement.`;
}

/**
 * Calculate the delta between two scores for the "vs. last attempt" display.
 */
export function scoreDelta(
  current: number,
  previous: number | null
): { text: string; direction: "up" | "down" | "same" | "first" } {
  if (previous === null) {
    return { text: "first attempt", direction: "first" };
  }

  const diff = round(current - previous);
  if (diff > 0) return { text: `+${diff}`, direction: "up" };
  if (diff < 0) return { text: `${diff}`, direction: "down" };
  return { text: "same", direction: "same" };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
