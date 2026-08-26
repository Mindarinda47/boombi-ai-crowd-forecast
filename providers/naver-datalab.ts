import { clampScore, riskLabelForScore, riskLevelForScore, TREND_WEIGHT, trendScore } from "../domain/forecast/score.ts";
import type { PublicForecastResponse } from "../domain/forecast/types.ts";

type NaverTrendPoint = {
  period: string;
  ratio: number;
};

type NaverTrendResult = {
  title: string;
  data: NaverTrendPoint[];
};

type NaverTrendResponse = {
  results?: NaverTrendResult[];
};

export type TrendSignal = {
  ratio: number;
  score: number;
  nearMonthlyPeak: boolean;
};

const KEYWORD_GROUPS = [
  { groupName: "seomyeon", keywords: ["서면", "서면 팝업", "서면 맛집"] },
  { groupName: "haeundae", keywords: ["해운대", "해운대 행사", "해운대 맛집"] },
  { groupName: "gwangalli", keywords: ["광안리", "광안리 행사", "광안리 맛집"] },
  { groupName: "centum", keywords: ["센텀시티", "벡스코", "센텀 행사"] },
  { groupName: "sajik", keywords: ["사직야구장", "사직 경기", "롯데 자이언츠"] },
  { groupName: "busan-station", keywords: ["부산역", "부산역 행사", "부산역 맛집"] },
  { groupName: "nampo", keywords: ["남포동", "남포동 행사", "남포동 맛집"] },
  { groupName: "gijang", keywords: ["기장", "오시리아", "기장 맛집"] },
  { groupName: "jeonpo", keywords: ["전포", "전포 카페거리", "전포 맛집"] },
  { groupName: "songjeong", keywords: ["송정", "송정해수욕장", "송정 맛집"] },
  { groupName: "yeongdo", keywords: ["영도", "흰여울문화마을", "태종대"] },
  { groupName: "pnu", keywords: ["부산대", "부산대 맛집", "부산대 행사"] },
  { groupName: "kyungsung", keywords: ["경성대", "부경대", "경성대 맛집"] },
  { groupName: "dongnae", keywords: ["동래", "동래 맛집", "온천장"] },
  { groupName: "dadaepo", keywords: ["다대포", "다대포해수욕장", "다대포 행사"] },
  { groupName: "gamcheon", keywords: ["감천문화마을", "감천동", "감천 관광"] },
  { groupName: "songdo", keywords: ["송도해수욕장", "송도 케이블카", "부산 송도"] },
  { groupName: "osiria", keywords: ["오시리아", "롯데월드 부산", "오시리아 맛집"] },
  { groupName: "taejongdae", keywords: ["태종대", "태종대유원지", "태종대 맛집"] },
  { groupName: "huinnyeoul", keywords: ["흰여울문화마을", "흰여울", "영도 흰여울"] },
  { groupName: "igidae", keywords: ["이기대", "오륙도", "이기대 해안산책로"] },
  { groupName: "deokcheon", keywords: ["덕천", "덕천 맛집", "덕천 젊음의거리"] },
  { groupName: "yeonsan", keywords: ["연산동", "연산동 맛집", "연산역"] },
  { groupName: "hadan", keywords: ["하단", "하단 맛집", "을숙도"] },
];

let trendCache: { expiresAt: number; value: Map<string, TrendSignal> | null } | undefined;

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function trendSignalFromData(data: NaverTrendPoint[]): TrendSignal | null {
  if (data.length < 4) return null;
  const recent = data.slice(-3).map((point) => Number(point.ratio) || 0);
  const previous = data.slice(-10, -3).map((point) => Number(point.ratio) || 0);
  if (previous.length === 0) return null;

  const recentAverage = average(recent);
  const previousAverage = average(previous);
  const monthlyPeak = Math.max(...data.map((point) => Number(point.ratio) || 0));
  const nearMonthlyPeak = monthlyPeak > 0 && Math.max(...recent) >= monthlyPeak * 0.9;

  return {
    ratio: previousAverage > 0 ? recentAverage / previousAverage : 1,
    score: trendScore(recentAverage, previousAverage, nearMonthlyPeak),
    nearMonthlyPeak,
  };
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function completeDateRange(now = new Date()) {
  const end = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return { startDate: dateKey(start), endDate: dateKey(end) };
}

async function requestTrendGroup(
  keywordGroups: typeof KEYWORD_GROUPS,
  clientId: string,
  clientSecret: string,
  startDate: string,
  endDate: string,
) {
  const response = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    body: JSON.stringify({ startDate, endDate, timeUnit: "date", keywordGroups }),
    cache: "no-store",
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error(`Naver DataLab 조회 실패 (${response.status})`);
  return response.json() as Promise<NaverTrendResponse>;
}

async function readNaverTrends(): Promise<Map<string, TrendSignal> | null> {
  const clientId = process.env.NAVER_DATALAB_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_DATALAB_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (trendCache && trendCache.expiresAt > Date.now()) return trendCache.value;

  const { startDate, endDate } = completeDateRange();
  try {
    const groups = Array.from(
      { length: Math.ceil(KEYWORD_GROUPS.length / 5) },
      (_, index) => KEYWORD_GROUPS.slice(index * 5, index * 5 + 5),
    );
    const responses = await Promise.all(
      groups.map((group) => requestTrendGroup(group, clientId, clientSecret, startDate, endDate)),
    );
    const signals = new Map<string, TrendSignal>();
    for (const result of responses.flatMap((response) => response.results ?? [])) {
      const signal = trendSignalFromData(result.data);
      if (signal) signals.set(result.title, signal);
    }
    const value = signals.size > 0 ? signals : null;
    trendCache = { expiresAt: Date.now() + (value ? 30 : 2) * 60 * 1000, value };
    return value;
  } catch {
    trendCache = { expiresAt: Date.now() + 2 * 60 * 1000, value: null };
    return null;
  }
}

function trendFactor(signal: TrendSignal) {
  if (signal.ratio >= 1.2) return `검색 관심도 ${signal.ratio.toFixed(1)}배 상승`;
  if (signal.ratio <= 0.8) return "검색 관심도 최근 하락";
  return "검색 관심도 최근 흐름 안정";
}

export async function enrichForecastWithNaver(forecast: PublicForecastResponse): Promise<PublicForecastResponse> {
  if (process.env.DEMO_MODE === "true") return forecast;
  const trends = await readNaverTrends();
  if (!trends) return { ...forecast, trendSource: "stored" };

  return {
    ...forecast,
    trendSource: "naver",
    regions: forecast.regions.map((region) => {
      const signal = trends.get(region.id);
      if (!signal) return region;
      const previousTrend = Number(region.scoreComponents.trend) || 0;
      const nextTrend = signal.score * TREND_WEIGHT;
      const adjustmentDelta = nextTrend - previousTrend;
      const score = clampScore(region.score + adjustmentDelta);
      const nextFactor = trendFactor(signal);
      const searchFactorIndex = region.factors.findIndex((factor) => factor.includes("검색"));
      const factors = searchFactorIndex >= 0
        ? region.factors.map((factor, index) => index === searchFactorIndex ? nextFactor : factor)
        : [nextFactor, ...region.factors].slice(0, 3);

      return {
        ...region,
        score,
        riskLevel: riskLevelForScore(score),
        riskLabel: riskLabelForScore(score),
        factors,
        hourly: region.hourly.map((hourlyScore) => clampScore(hourlyScore + adjustmentDelta)),
        scoreComponents: { ...region.scoreComponents, trend: nextTrend },
      };
    }),
  };
}
