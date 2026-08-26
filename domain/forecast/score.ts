import type { IndoorOutdoor, RiskLevelCode, ScoreInputs, ScoreResult } from "./types.ts";

export const ALGORITHM_VERSION = "forecast-v1.3.0";

export const BASELINE_WEIGHT = 0.6;
export const TREND_WEIGHT = 0.25;
export const CALENDAR_WEIGHT = 0.15;
export const EVENT_BONUS_WEIGHT = 0.25;

export function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function riskLevelForScore(score: number): RiskLevelCode {
  const value = clampScore(score);
  if (value >= 90) return "extreme";
  if (value >= 75) return "very_busy";
  if (value >= 55) return "busy";
  if (value >= 35) return "normal";
  return "calm";
}

export function riskLabelForScore(score: number) {
  const labels: Record<RiskLevelCode, string> = {
    calm: "여유",
    normal: "보통",
    busy: "혼잡",
    very_busy: "매우 혼잡",
    extreme: "극심",
  };
  return labels[riskLevelForScore(score)];
}

export function calculateForecastScore(input: ScoreInputs): ScoreResult {
  const components = {
    baseline: clampScore(input.baseline) * BASELINE_WEIGHT,
    eventImpact: clampScore(input.eventImpact) * EVENT_BONUS_WEIGHT,
    trend: clampScore(input.trend) * TREND_WEIGHT,
    calendar: clampScore(input.calendar) * CALENDAR_WEIGHT,
    weatherAdjustment: Math.max(-12, Math.min(12, input.weatherAdjustment)),
    nearbyEventAdjustment: Math.max(0, Math.min(10, input.nearbyEventAdjustment)),
  };

  const score = clampScore(Object.values(components).reduce((sum, value) => sum + value, 0));
  return { score, riskLevel: riskLevelForScore(score), components };
}

export function eventImpactScore(input: {
  scale: "small" | "medium" | "large" | "mega" | "unknown";
  limitedGoods?: boolean;
  firstCome?: boolean;
  numberedTickets?: boolean;
  freeAdmission?: boolean;
  nationwideAttraction?: boolean;
  startTimeConcentration?: boolean;
}) {
  const base = { small: 20, medium: 45, large: 70, mega: 90, unknown: 35 }[input.scale];
  return clampScore(
    base +
      (input.limitedGoods ? 10 : 0) +
      (input.firstCome ? 10 : 0) +
      (input.numberedTickets ? 8 : 0) +
      (input.freeAdmission ? 4 : 0) +
      (input.nationwideAttraction ? 10 : 0) +
      (input.startTimeConcentration ? 5 : 0),
  );
}

export function combineEventImpacts(scores: number[]) {
  if (scores.length === 0) return 0;
  const sorted = scores.map(clampScore).sort((a, b) => b - a);
  return clampScore(sorted[0] + sorted.slice(1).reduce((sum, score) => sum + score, 0) * 0.35);
}

export function trendScore(recentThreeDayAverage: number, previousSevenDayAverage: number, nearMonthlyPeak = false) {
  if (previousSevenDayAverage <= 0) return 45;
  const ratio = recentThreeDayAverage / previousSevenDayAverage;
  const base = ratio < 0.8 ? 25 : ratio < 1.2 ? 45 : ratio < 1.5 ? 60 : ratio < 2 ? 75 : 90;
  return clampScore(base + (nearMonthlyPeak ? 5 : 0));
}

export function weatherAdjustment(input: {
  venue: IndoorOutdoor;
  precipitationProbability?: number;
  precipitationMm?: number;
  heatwave?: boolean;
  strongWind?: boolean;
}) {
  const isIndoor = input.venue === "indoor";
  const isOutdoor = input.venue === "outdoor";
  const isMixed = input.venue === "mixed" || input.venue === "unknown";
  const rainy = (input.precipitationProbability ?? 0) >= 60;
  const heavyRain = (input.precipitationMm ?? 0) >= 15;

  let indoor = rainy ? 4 : 0;
  let outdoor = rainy ? -6 : 0;
  if (heavyRain) {
    indoor = 6;
    outdoor = -12;
  }
  if (input.heatwave) {
    indoor += 4;
    outdoor -= 8;
  }
  if (input.strongWind) outdoor -= 6;

  const value = isIndoor ? indoor : isOutdoor ? outdoor : isMixed ? (indoor + outdoor) / 2 : 0;
  return Math.max(-12, Math.min(12, Math.round(value)));
}
