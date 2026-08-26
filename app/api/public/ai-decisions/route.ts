import { createDemoForecast } from "../../../../fixtures/forecast";
import { applyCalendarProfile } from "../../../../domain/forecast/calendar-profile";
import type {
  AlternativePriority,
  DecisionRequest,
  ScenarioCalendar,
  ScenarioEvent,
  ScenarioWeather,
} from "../../../../domain/decision/types";
import { enrichForecastWithAutoEvents } from "../../../../providers/auto-event-forecast";
import { enrichForecastWithKma } from "../../../../providers/kma-weather";
import { enrichForecastWithNaver } from "../../../../providers/naver-datalab";
import { generateAlternativeDecision, generateScenarioDecision } from "../../../../providers/openai-decisions";
import { readSupabaseForecast } from "../../../../repositories/supabase-forecast-repository";
import { readForecastControlSettings } from "../../../../repositories/supabase-forecast-writer";

export const dynamic = "force-dynamic";

const priorities = new Set<AlternativePriority>(["similar", "calmest", "indoor"]);
const weatherOptions = new Set<ScenarioWeather>(["forecast", "clear", "rain"]);
const eventOptions = new Set<ScenarioEvent>(["forecast", "cancelled", "major"]);
const calendarOptions = new Set<ScenarioCalendar>(["forecast", "weekday", "weekend", "holiday"]);
const rateWindows = new Map<string, { count: number; resetAt: number }>();
const decisionCache = new Map<string, { expiresAt: number; value: unknown }>();

async function privacySafeIdentifier(request: Request) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "anonymous";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`boombi:${address.trim()}`));
  return `boombi_${Array.from(new Uint8Array(digest)).slice(0, 12).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function withinRateLimit(identifier: string) {
  const now = Date.now();
  const current = rateWindows.get(identifier);
  if (!current || current.resetAt <= now) {
    rateWindows.set(identifier, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function validRequest(value: unknown): value is DecisionRequest {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
    || typeof input.selectedRegionId !== "string" || input.selectedRegionId.length > 40) return false;
  if (input.action === "alternatives") return typeof input.priority === "string" && priorities.has(input.priority as AlternativePriority);
  if (input.action === "scenario") {
    return typeof input.weather === "string" && weatherOptions.has(input.weather as ScenarioWeather)
      && typeof input.event === "string" && eventOptions.has(input.event as ScenarioEvent)
      && typeof input.calendar === "string" && calendarOptions.has(input.calendar as ScenarioCalendar);
  }
  return false;
}

async function forecastFor(date: string) {
  try {
    const stored = await readSupabaseForecast(date);
    if (stored) return stored;
  } catch {
    // Keep the decision tools available if the stored forecast is temporarily unavailable.
  }
  const withWeather = await enrichForecastWithKma(createDemoForecast(date));
  const withTrend = await enrichForecastWithNaver(withWeather);
  return applyCalendarProfile(await enrichForecastWithAutoEvents(withTrend));
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 4_096) return Response.json({ error: "요청 내용이 너무 깁니다." }, { status: 413 });
    const input = JSON.parse(raw) as unknown;
    if (!validRequest(input)) return Response.json({ error: "혼잡 회피 요청 형식이 올바르지 않습니다." }, { status: 400 });

    const identifier = await privacySafeIdentifier(request);
    if (!withinRateLimit(identifier)) {
      return Response.json({ error: "잠시 후 다시 이용해 주세요." }, { status: 429, headers: { "Retry-After": "600" } });
    }

    const forecast = await forecastFor(input.date);
    if (!forecast.regions.some((region) => region.id === input.selectedRegionId)) {
      return Response.json({ error: "지원하지 않는 지역입니다." }, { status: 404 });
    }

    const control = await readForecastControlSettings();
    const allowAi = control.storage_ready && control.ai_decision_enabled;
    const cacheKey = JSON.stringify({ input, asOf: forecast.asOf, allowAi });
    const cached = decisionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return Response.json(cached.value, { headers: { "Cache-Control": "private, max-age=0", "X-Decision-Cache": "hit" } });
    }

    const result = input.action === "alternatives"
      ? await generateAlternativeDecision(forecast, input, identifier, allowAi)
      : await generateScenarioDecision(forecast, input, identifier, allowAi);
    decisionCache.set(cacheKey, { expiresAt: Date.now() + 15 * 60_000, value: result });
    if (decisionCache.size > 200) {
      for (const [key, value] of decisionCache) if (value.expiresAt <= Date.now()) decisionCache.delete(key);
    }
    return Response.json(result, {
      headers: { "Cache-Control": "private, max-age=0", "X-Decision-Source": result.source },
    });
  } catch (error) {
    const message = error instanceof SyntaxError ? "요청 내용을 읽을 수 없습니다." : "의사결정 결과를 만들지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
