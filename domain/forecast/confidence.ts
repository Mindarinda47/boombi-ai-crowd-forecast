import type { ConfidenceInputs } from "./types.ts";
import { clampScore } from "./score.ts";

export function calculateConfidence(input: ConfidenceInputs) {
  const score = clampScore(
    Math.max(0, Math.min(1, input.officialSourceQuality)) * 30 +
      Math.max(0, Math.min(1, input.baselineQuality)) * 25 +
      Math.max(0, Math.min(1, input.trendQuality)) * 20 +
      Math.max(0, Math.min(1, input.weatherQuality)) * 15 +
      Math.max(0, Math.min(1, input.freshness)) * 10,
  );

  return {
    score,
    level: score >= 75 ? ("high" as const) : score >= 45 ? ("medium" as const) : ("low" as const),
  };
}
