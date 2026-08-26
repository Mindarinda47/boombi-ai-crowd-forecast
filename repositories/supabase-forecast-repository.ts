import { ALGORITHM_VERSION, riskLabelForScore, riskLevelForScore } from "../domain/forecast/score.ts";
import type { EventRelatedLink, PublicForecastResponse, RegionForecast, ScoreResult } from "../domain/forecast/types.ts";
import { getSupabasePublicConfig, type SupabasePublicConfig } from "../lib/env.ts";

type RegionRow = {
  id: string;
  slug: string;
  name_ko: string;
  area_name: string;
  display_x: number;
  display_y: number;
};

type DailyRow = {
  region_id: string;
  forecast_date: string;
  peak_score: number;
  confidence_score: number;
  confidence_level: "low" | "medium" | "high";
  peak_start_at: string;
  peak_end_at: string;
  recommended_start_at: string;
  recommended_end_at: string;
  top_factors: string[];
  weather_label: string;
  event_title: string;
  event_meta: string;
  score_components: ScoreResult["components"] & {
    eventSourceMeta?: {
      source?: "public_api" | "stored";
      name?: string;
      url?: string | null;
      imageUrl?: string | null;
      relatedLinks?: EventRelatedLink[];
      evidence?: string;
      updatedAt?: string;
    };
  };
  generated_at: string;
};

type SlotRow = {
  region_id: string;
  starts_at: string;
  score: number;
};

function timeLabel(value: string) {
  return value.slice(0, 5);
}

function timeRange(start: string, end: string) {
  return `${timeLabel(start)}–${timeLabel(end)}`;
}

async function selectRows<T>(config: SupabasePublicConfig, table: string, params: URLSearchParams) {
  const url = new URL(`${config.url}/rest/v1/${table}`);
  url.search = params.toString();
  const response = await fetch(url, {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${config.publishableKey}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(3500),
  });

  if (!response.ok) {
    throw new Error(`Supabase ${table} 조회 실패 (${response.status})`);
  }
  return response.json() as Promise<T[]>;
}

export async function readSupabaseForecast(date: string, regionSlug?: string | null): Promise<PublicForecastResponse | null> {
  const config = getSupabasePublicConfig();
  if (!config || process.env.DEMO_MODE === "true") return null;

  const regionParams = new URLSearchParams({
    select: "id,slug,name_ko,area_name,display_x,display_y",
    active: "eq.true",
    order: "name_ko.asc",
  });
  if (regionSlug) regionParams.set("slug", `eq.${regionSlug}`);

  const dayParams = new URLSearchParams({
    select: "region_id,forecast_date,peak_score,confidence_score,confidence_level,peak_start_at,peak_end_at,recommended_start_at,recommended_end_at,top_factors,weather_label,event_title,event_meta,score_components,generated_at",
    forecast_date: `eq.${date}`,
  });

  const slotParams = new URLSearchParams({
    select: "region_id,starts_at,score",
    algorithm_version: `eq.${ALGORITHM_VERSION}`,
    order: "starts_at.asc",
  });
  slotParams.append("starts_at", `gte.${date}T00:00:00+09:00`);
  slotParams.append("starts_at", `lt.${date}T23:59:59+09:00`);

  const [regions, daily, slots] = await Promise.all([
    selectRows<RegionRow>(config, "regions", regionParams),
    selectRows<DailyRow>(config, "forecast_daily", dayParams),
    selectRows<SlotRow>(config, "forecast_slots", slotParams),
  ]);
  if (regions.length === 0 || daily.length === 0) return null;

  const dailyByRegion = new Map(daily.map((row) => [row.region_id, row]));
  const slotsByRegion = new Map<string, SlotRow[]>();
  for (const slot of slots) {
    const regionSlots = slotsByRegion.get(slot.region_id) ?? [];
    regionSlots.push(slot);
    slotsByRegion.set(slot.region_id, regionSlots);
  }

  const forecasts = regions.flatMap((region): RegionForecast[] => {
    const summary = dailyByRegion.get(region.id);
    if (!summary) return [];
    const regionSlots = (slotsByRegion.get(region.id) ?? [])
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const score = Math.round(summary.peak_score);
    const { eventSourceMeta, ...scoreComponents } = summary.score_components;
    const hours = regionSlots.map((slot) =>
      new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false })
        .format(new Date(slot.starts_at))
        .replace("시", "")
        .trim(),
    );

    return [{
      id: region.slug,
      name: region.name_ko,
      area: region.area_name,
      score,
      riskLevel: riskLevelForScore(score),
      riskLabel: riskLabelForScore(score),
      confidence: Math.round(summary.confidence_score),
      confidenceLevel: summary.confidence_level,
      weather: summary.weather_label,
      peak: timeRange(summary.peak_start_at, summary.peak_end_at),
      calm: timeRange(summary.recommended_start_at, summary.recommended_end_at),
      factors: summary.top_factors,
      event: summary.event_title,
      eventMeta: summary.event_meta,
      eventSource: eventSourceMeta?.source ?? "stored",
      eventSourceName: eventSourceMeta?.name ?? "Supabase 저장 예보",
      eventSourceUrl: eventSourceMeta?.url ?? null,
      eventImageUrl: eventSourceMeta?.imageUrl ?? null,
      eventRelatedLinks: eventSourceMeta?.relatedLinks ?? [],
      eventEvidence: eventSourceMeta?.evidence ?? summary.top_factors.join(" · "),
      eventUpdatedAt: eventSourceMeta?.updatedAt ?? summary.generated_at,
      x: Number(region.display_x),
      y: Number(region.display_y),
      hourly: regionSlots.map((slot) => Math.round(slot.score)),
      hours,
      scoreComponents,
    }];
  });

  if (forecasts.length === 0) return null;
  const latestGeneratedAt = daily.reduce((latest, row) => row.generated_at > latest ? row.generated_at : latest, daily[0].generated_at);
  return { asOf: latestGeneratedAt, date, mode: "live", weatherSource: "stored", trendSource: "stored", algorithmVersion: ALGORITHM_VERSION, regions: forecasts };
}
