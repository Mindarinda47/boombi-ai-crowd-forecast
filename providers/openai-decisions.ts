import type { PublicForecastResponse } from "../domain/forecast/types.ts";
import { createAlternativeDecision, createScenarioDecision } from "../domain/decision/fallback.ts";
import type {
  AlternativeDecisionResponse,
  AlternativeRequest,
  ScenarioDecisionResponse,
  ScenarioRequest,
} from "../domain/decision/types.ts";
import { hasConfiguredAiProvider, requestStructuredAi } from "./ai-runtime.ts";

function canUseAi(allowAi: boolean) {
  return allowAi && process.env.AI_DECISION_MODE?.trim() === "live" && hasConfiguredAiProvider();
}

async function requestStructuredOutput<T>(
  name: string,
  schema: Record<string, unknown>,
  input: Array<{ role: "system" | "user"; content: string }>,
  validate: (value: unknown) => value is T,
) {
  return requestStructuredAi({
    name,
    schema,
    messages: input,
    validate,
    maxOutputTokens: 900,
  });
}

export async function generateAlternativeDecision(
  forecast: PublicForecastResponse,
  request: AlternativeRequest,
  _safetyIdentifier: string,
  allowAi = true,
): Promise<AlternativeDecisionResponse> {
  const fallback = createAlternativeDecision(forecast, request.selectedRegionId, request.priority);
  if (!canUseAi(allowAi)) return fallback;

  const selected = forecast.regions.find((region) => region.id === request.selectedRegionId);
  if (!selected) return fallback;
  const candidates = fallback.recommendations
    .map((recommendation) => forecast.regions.find((region) => region.id === recommendation.regionId))
    .filter((region): region is NonNullable<typeof region> => Boolean(region))
    .map((region, index) => ({
      regionId: region.id,
      regionName: region.name,
      area: region.area,
      score: region.score,
      bestTime: region.calm,
      peak: region.peak,
      weather: region.weather,
      factors: region.factors.slice(0, 2),
      calculatedRank: index + 1,
      calculatedReason: fallback.recommendations[index]?.why,
      calculatedTradeoff: fallback.recommendations[index]?.tradeoff,
    }));
  const candidateIds = candidates.map((candidate) => candidate.regionId);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      recommendations: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            regionId: { type: "string", enum: candidateIds },
            fitScore: { type: "integer", minimum: 0, maximum: 100 },
            why: { type: "string" },
            tradeoff: { type: "string" },
          },
          required: ["regionId", "fitScore", "why", "tradeoff"],
        },
      },
    },
    required: ["summary", "recommendations"],
  };
  type AlternativeAiOutput = {
    summary: string;
    recommendations: Array<{ regionId: string; fitScore: number; why: string; tradeoff: string }>;
  };
  const validAlternative = (value: unknown): value is AlternativeAiOutput => {
    if (!value || typeof value !== "object") return false;
    const item = value as { summary?: unknown; recommendations?: unknown };
    if (typeof item.summary !== "string" || !Array.isArray(item.recommendations) || item.recommendations.length !== 3) return false;
    return item.recommendations.every((recommendation) => recommendation && typeof recommendation === "object"
      && typeof recommendation.regionId === "string" && candidateIds.includes(recommendation.regionId)
      && typeof recommendation.fitScore === "number" && recommendation.fitScore >= 0 && recommendation.fitScore <= 100
      && typeof recommendation.why === "string" && typeof recommendation.tradeoff === "string");
  };

  try {
    const result = await requestStructuredOutput("boombi_alternatives", schema, [
      {
        role: "system",
        content: "부산 혼잡 예보의 대체 장소 설명자입니다. 제공된 세 후보와 순서는 목적 적합도·장소 매력도·이동 부담·혼잡도를 계산해 확정한 결과입니다. 후보와 순서, 혼잡 점수와 시간은 변경하지 말고, 제공된 근거만 사용해 한국어로 짧고 구체적으로 설명하세요.",
      },
      {
        role: "user",
        content: JSON.stringify({ date: request.date, priority: request.priority, selected, candidates }),
      },
    ], validAlternative);
    const parsed = result.value;
    const ids = parsed.recommendations.map((item) => item.regionId);
    if (new Set(ids).size !== 3 || ids.some((id, index) => typeof id !== "string" || id !== candidateIds[index])) return fallback;

    const recommendations = parsed.recommendations.flatMap((item) => {
      const region = forecast.regions.find((candidate) => candidate.id === item.regionId);
      if (!region || typeof item.fitScore !== "number" || typeof item.why !== "string" || typeof item.tradeoff !== "string") return [];
      return [{
        regionId: region.id,
        regionName: region.name,
        area: region.area,
        score: region.score,
        fitScore: item.fitScore,
        bestTime: region.calm,
        why: item.why,
        tradeoff: item.tradeoff,
      }];
    });
    if (recommendations.length !== 3) return fallback;
    return { ...fallback, source: result.provider, summary: parsed.summary, recommendations, generatedAt: new Date().toISOString() };
  } catch {
    return fallback;
  }
}

export async function generateScenarioDecision(
  forecast: PublicForecastResponse,
  request: ScenarioRequest,
  _safetyIdentifier: string,
  allowAi = true,
): Promise<ScenarioDecisionResponse> {
  const fallback = createScenarioDecision(forecast, request);
  if (!canUseAi(allowAi)) return fallback;
  const region = forecast.regions.find((item) => item.id === request.selectedRegionId);
  if (!region) return fallback;
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      effects: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
      recommendedTime: { type: "string" },
      confidenceNote: { type: "string" },
    },
    required: ["summary", "effects", "recommendedTime", "confidenceNote"],
  };
  type ScenarioAiOutput = { summary: string; effects: string[]; recommendedTime: string; confidenceNote: string };
  const validScenario = (value: unknown): value is ScenarioAiOutput => {
    if (!value || typeof value !== "object") return false;
    const item = value as Record<string, unknown>;
    return typeof item.summary === "string" && Array.isArray(item.effects) && item.effects.length === 3
      && item.effects.every((effect) => typeof effect === "string") && typeof item.recommendedTime === "string"
      && typeof item.confidenceNote === "string";
  };

  try {
    const result = await requestStructuredOutput("boombi_scenario", schema, [
      {
        role: "system",
        content: "부산 혼잡 예보의 조건 비교 분석자입니다. 계산된 기준 점수와 시나리오 점수는 변경하지 마세요. 제공된 근거만 사용해 변화 원인, 방문 판단, 불확실성을 한국어로 간결하게 설명하세요.",
      },
      {
        role: "user",
        content: JSON.stringify({
          date: request.date,
          conditions: { weather: request.weather, event: request.event, calendar: request.calendar },
          region,
          calculatedResult: fallback,
        }),
      },
    ], validScenario);
    const parsed = result.value;
    return {
      ...fallback,
      source: result.provider,
      summary: parsed.summary,
      effects: parsed.effects,
      recommendedTime: parsed.recommendedTime,
      confidenceNote: parsed.confidenceNote,
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}
