import { clampScore, riskLabelForScore, riskLevelForScore, weatherAdjustment } from "../domain/forecast/score.ts";
import type { IndoorOutdoor, PublicForecastResponse } from "../domain/forecast/types.ts";

type KmaForecastItem = {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
};

type KmaResponse = {
  response?: {
    header?: { resultCode?: string };
    body?: { items?: { item?: KmaForecastItem[] } };
  };
};

type WeatherSnapshot = {
  label: string;
  precipitationProbability: number;
  precipitationMm: number;
  temperature: number;
  windSpeed: number;
};

const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
const VENUE_BY_REGION: Record<string, IndoorOutdoor> = {
  seomyeon: "mixed",
  haeundae: "outdoor",
  gwangalli: "outdoor",
  centum: "indoor",
  sajik: "outdoor",
  "busan-station": "mixed",
  nampo: "outdoor",
  gijang: "outdoor",
  jeonpo: "mixed",
  songjeong: "outdoor",
  yeongdo: "outdoor",
  pnu: "mixed",
  kyungsung: "mixed",
  dongnae: "mixed",
  dadaepo: "outdoor",
  gamcheon: "outdoor",
  songdo: "outdoor",
  osiria: "mixed",
  taejongdae: "outdoor",
  huinnyeoul: "outdoor",
  igidae: "outdoor",
  deokcheon: "mixed",
  yeonsan: "mixed",
  hadan: "mixed",
};

const weatherCache = new Map<string, { expiresAt: number; value: WeatherSnapshot | null }>();

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function latestBase(now = new Date()) {
  const seoulWithReleaseDelay = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 45 * 60 * 1000);
  const hour = seoulWithReleaseDelay.getUTCHours();
  let baseHour = [...BASE_HOURS].reverse().find((candidate) => candidate <= hour);
  if (baseHour === undefined) {
    seoulWithReleaseDelay.setUTCDate(seoulWithReleaseDelay.getUTCDate() - 1);
    baseHour = 23;
  }
  return { baseDate: dateKey(seoulWithReleaseDelay), baseTime: `${String(baseHour).padStart(2, "0")}00` };
}

function precipitationMm(value?: string) {
  if (!value || value.includes("강수없음")) return 0;
  if (value.includes("미만")) return 0.5;
  const parsed = Number(value.match(/[\d.]+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : 0;
}

function conditionLabel(precipitationType?: string, sky?: string) {
  const precipitation = { "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" }[precipitationType ?? ""];
  if (precipitation) return precipitation;
  return { "1": "맑음", "3": "구름 많음", "4": "흐림" }[sky ?? ""] ?? "날씨 정보";
}

export function snapshotFromItems(items: KmaForecastItem[], forecastDate: string): WeatherSnapshot | null {
  const dateItems = items.filter((item) => item.fcstDate === forecastDate);
  const times = [...new Set(dateItems.map((item) => item.fcstTime))];
  if (times.length === 0) return null;
  const targetTime = times.sort((a, b) => Math.abs(Number(a) - 1400) - Math.abs(Number(b) - 1400))[0];
  const values = new Map(dateItems.filter((item) => item.fcstTime === targetTime).map((item) => [item.category, item.fcstValue]));
  const temperature = Number(values.get("TMP"));
  if (!Number.isFinite(temperature)) return null;

  return {
    label: `${conditionLabel(values.get("PTY"), values.get("SKY"))} ${Math.round(temperature)}°`,
    precipitationProbability: Number(values.get("POP")) || 0,
    precipitationMm: precipitationMm(values.get("PCP")),
    temperature,
    windSpeed: Number(values.get("WSD")) || 0,
  };
}

async function readKmaWeather(date: string): Promise<WeatherSnapshot | null> {
  const serviceKey = process.env.KMA_SERVICE_KEY?.trim();
  if (!serviceKey) return null;
  const { baseDate, baseTime } = latestBase();
  const cacheKey = `${baseDate}-${baseTime}-${date}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: baseDate,
    base_time: baseTime,
    nx: "98",
    ny: "76",
  });

  try {
    const response = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) {
      weatherCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, value: null });
      return null;
    }
    const payload = await response.json() as KmaResponse;
    const items = payload.response?.body?.items?.item ?? [];
    const snapshot = payload.response?.header?.resultCode === "00"
      ? snapshotFromItems(items, date.replaceAll("-", ""))
      : null;
    weatherCache.set(cacheKey, { expiresAt: Date.now() + (snapshot ? 30 : 2) * 60 * 1000, value: snapshot });
    return snapshot;
  } catch {
    weatherCache.set(cacheKey, { expiresAt: Date.now() + 2 * 60 * 1000, value: null });
    return null;
  }
}

export async function enrichForecastWithKma(forecast: PublicForecastResponse): Promise<PublicForecastResponse> {
  if (process.env.DEMO_MODE === "true") return forecast;
  const weather = await readKmaWeather(forecast.date);
  if (!weather) return { ...forecast, weatherSource: "stored" };

  return {
    ...forecast,
    weatherSource: "kma",
    regions: forecast.regions.map((region) => {
      const venue = VENUE_BY_REGION[region.id] ?? "unknown";
      const previousAdjustment = Number(region.scoreComponents.weatherAdjustment) || 0;
      const nextAdjustment = weatherAdjustment({
        venue,
        precipitationProbability: weather.precipitationProbability,
        precipitationMm: weather.precipitationMm,
        heatwave: weather.temperature >= 33,
        strongWind: weather.windSpeed >= 14,
      });
      const adjustmentDelta = nextAdjustment - previousAdjustment;
      const score = clampScore(region.score + adjustmentDelta);
      return {
        ...region,
        score,
        riskLevel: riskLevelForScore(score),
        riskLabel: riskLabelForScore(score),
        weather: weather.label,
        hourly: region.hourly.map((hourlyScore) => clampScore(hourlyScore + adjustmentDelta)),
        scoreComponents: { ...region.scoreComponents, weatherAdjustment: nextAdjustment },
      };
    }),
  };
}
