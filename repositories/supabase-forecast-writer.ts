import type { PublicForecastResponse } from "../domain/forecast/types.ts";
import { riskLevelForScore } from "../domain/forecast/score.ts";
import { getSupabaseServiceConfig, type SupabaseServiceConfig } from "../lib/env.ts";
import type { EventCandidate } from "../providers/event-discovery.ts";
import type { EventAnalysis } from "../providers/openai-event-analysis.ts";

type RegionIdRow = { id: string; slug: string };
type JobRow = { id: string };

export type ForecastControlSettings = {
  id: number;
  auto_refresh_enabled: boolean;
  ai_analysis_enabled: boolean;
  ai_decision_enabled: boolean;
  max_ai_analyses_per_run: number;
  refresh_in_progress: boolean;
  refresh_started_at: string | null;
  refresh_trigger_source: "manual" | "schedule" | null;
  last_manual_refresh_at: string | null;
  last_schedule_refresh_at: string | null;
  last_finished_at: string | null;
  updated_at: string;
  updated_by: string | null;
  storage_ready: boolean;
};

export type ForecastRefreshLockResult =
  | { acquired: true; settings: ForecastControlSettings }
  | { acquired: false; reason: "automatic_disabled" | "already_running" | "manual_cooldown" | "storage_unavailable"; settings: ForecastControlSettings };

const DEFAULT_CONTROL_SETTINGS: ForecastControlSettings = {
  id: 1,
  auto_refresh_enabled: false,
  ai_analysis_enabled: false,
  ai_decision_enabled: false,
  max_ai_analyses_per_run: 3,
  refresh_in_progress: false,
  refresh_started_at: null,
  refresh_trigger_source: null,
  last_manual_refresh_at: null,
  last_schedule_refresh_at: null,
  last_finished_at: null,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
  storage_ready: false,
};

export type EventDiscoveryRecord = {
  source_key: string;
  content_hash: string;
  candidate: EventCandidate;
  analysis: EventAnalysis;
  decision_status: "auto_approved" | "needs_review" | "excluded";
  first_seen_at: string;
  last_seen_at: string;
  analyzed_at: string;
};

export type ForecastJobRun = {
  id: string;
  job_name: string;
  trigger_source: string;
  status: "running" | "succeeded" | "failed";
  forecast_dates: number;
  regions_written: number;
  public_events_applied: number;
  source_status: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
};

function serviceHeaders(config: SupabaseServiceConfig, prefer?: string) {
  const authorization = config.serviceRoleKey.startsWith("sb_secret_")
    ? {}
    : { Authorization: `Bearer ${config.serviceRoleKey}` };
  return {
    apikey: config.serviceRoleKey,
    ...authorization,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function serviceRequest<T>(config: SupabaseServiceConfig, path: string, init: RequestInit) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(config), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Supabase 자동 갱신 저장 실패 (${response.status})`);
  const body = await response.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

function timeRange(value: string, fallbackStart: string, fallbackEnd: string) {
  const times = value.match(/\d{2}:\d{2}/g) ?? [];
  return { start: times[0] ?? fallbackStart, end: times[1] ?? fallbackEnd };
}

export function isRefreshAuthorized(request: Request, expectedSecret = process.env.CRON_SHARED_SECRET?.trim()) {
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || "";
  if (provided.length !== expectedSecret.length) return false;
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expectedSecret.charCodeAt(index);
  }
  return difference === 0;
}

export function hasForecastAutomationConfig() {
  return Boolean(getSupabaseServiceConfig() && process.env.CRON_SHARED_SECRET?.trim());
}

export async function readForecastControlSettings(): Promise<ForecastControlSettings> {
  const config = getSupabaseServiceConfig();
  if (!config) return { ...DEFAULT_CONTROL_SETTINGS };
  try {
    const rows = await serviceRequest<Omit<ForecastControlSettings, "storage_ready">[]>(
      config,
      "forecast_control_settings?id=eq.1&select=*",
      { method: "GET" },
    );
    return rows[0] ? { ...rows[0], storage_ready: true } : { ...DEFAULT_CONTROL_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTROL_SETTINGS };
  }
}

export async function updateForecastControlSettings(
  values: Pick<ForecastControlSettings, "auto_refresh_enabled" | "ai_analysis_enabled" | "ai_decision_enabled" | "max_ai_analyses_per_run">,
  updatedBy: string,
) {
  const config = getSupabaseServiceConfig();
  if (!config) throw new Error("Supabase service_role 설정이 필요합니다.");
  const rows = await serviceRequest<Omit<ForecastControlSettings, "storage_ready">[]>(
    config,
    "forecast_control_settings?id=eq.1&select=*",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...values, updated_at: new Date().toISOString(), updated_by: updatedBy }),
    },
  );
  if (!rows[0]) throw new Error("관리자 제어 설정을 저장하지 못했습니다.");
  return { ...rows[0], storage_ready: true } satisfies ForecastControlSettings;
}

export async function acquireForecastRefreshLock(triggerSource: "manual" | "schedule"): Promise<ForecastRefreshLockResult> {
  const config = getSupabaseServiceConfig();
  const settings = await readForecastControlSettings();
  if (!config || !settings.storage_ready) return { acquired: false, reason: "storage_unavailable", settings };
  if (triggerSource === "schedule" && !settings.auto_refresh_enabled) {
    return { acquired: false, reason: "automatic_disabled", settings };
  }

  const now = new Date();
  if (settings.refresh_in_progress && settings.refresh_started_at
    && now.getTime() - new Date(settings.refresh_started_at).getTime() > 15 * 60_000) {
    await serviceRequest<void>(config, "forecast_control_settings?id=eq.1", {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ refresh_in_progress: false, refresh_started_at: null, refresh_trigger_source: null }),
    });
    settings.refresh_in_progress = false;
  }
  if (settings.refresh_in_progress) return { acquired: false, reason: "already_running", settings };
  if (triggerSource === "manual" && settings.last_manual_refresh_at
    && now.getTime() - new Date(settings.last_manual_refresh_at).getTime() < 60_000) {
    return { acquired: false, reason: "manual_cooldown", settings };
  }

  const timestamp = now.toISOString();
  const triggerField = triggerSource === "manual" ? { last_manual_refresh_at: timestamp } : { last_schedule_refresh_at: timestamp };
  const rows = await serviceRequest<Omit<ForecastControlSettings, "storage_ready">[]>(
    config,
    "forecast_control_settings?id=eq.1&refresh_in_progress=eq.false&select=*",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        refresh_in_progress: true,
        refresh_started_at: timestamp,
        refresh_trigger_source: triggerSource,
        ...triggerField,
      }),
    },
  );
  if (!rows[0]) return { acquired: false, reason: "already_running", settings: await readForecastControlSettings() };
  return { acquired: true, settings: { ...rows[0], storage_ready: true } };
}

export async function releaseForecastRefreshLock() {
  const config = getSupabaseServiceConfig();
  if (!config) return;
  await serviceRequest<void>(config, "forecast_control_settings?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      refresh_in_progress: false,
      refresh_started_at: null,
      refresh_trigger_source: null,
      last_finished_at: new Date().toISOString(),
    }),
  });
}

export async function readRecentForecastJobs(limit = 30) {
  const config = getSupabaseServiceConfig();
  if (!config) return [];
  const safeLimit = Math.max(1, Math.min(30, Math.round(limit)));
  return serviceRequest<ForecastJobRun[]>(
    config,
    `forecast_job_runs?select=id,job_name,trigger_source,status,forecast_dates,regions_written,public_events_applied,source_status,error_message,started_at,finished_at&order=started_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export async function startForecastJob(triggerSource: string) {
  const config = getSupabaseServiceConfig();
  if (!config) throw new Error("Supabase service_role 설정이 필요합니다.");
  const rows = await serviceRequest<JobRow[]>(config, "forecast_job_runs?select=id", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ job_name: "refresh_forecast", trigger_source: triggerSource, status: "running" }),
  });
  if (!rows[0]?.id) throw new Error("자동 갱신 작업 이력을 시작하지 못했습니다.");
  return rows[0].id;
}

export async function finishForecastJob(jobId: string, values: Record<string, unknown>) {
  const config = getSupabaseServiceConfig();
  if (!config) return;
  await serviceRequest<void>(config, `forecast_job_runs?id=eq.${encodeURIComponent(jobId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ ...values, finished_at: new Date().toISOString() }),
  });
}

export async function readEventDiscoveryRecords(limit = 500) {
  const config = getSupabaseServiceConfig();
  if (!config) return [];
  const safeLimit = Math.max(1, Math.min(500, Math.round(limit)));
  return serviceRequest<EventDiscoveryRecord[]>(
    config,
    `event_discovery_records?select=source_key,content_hash,candidate,analysis,decision_status,first_seen_at,last_seen_at,analyzed_at&order=last_seen_at.desc&limit=${safeLimit}`,
    { method: "GET" },
  );
}

export async function writeEventDiscoveryRecords(records: EventDiscoveryRecord[]) {
  if (records.length === 0) return;
  const config = getSupabaseServiceConfig();
  if (!config) return;
  await serviceRequest<void>(config, "event_discovery_records?on_conflict=source_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(records),
  });
}

export async function writeForecastSnapshots(forecasts: PublicForecastResponse[], generatedAt = new Date().toISOString()) {
  const config = getSupabaseServiceConfig();
  if (!config) throw new Error("Supabase service_role 설정이 필요합니다.");
  const regions = await serviceRequest<RegionIdRow[]>(config, "regions?select=id,slug&active=eq.true", { method: "GET" });
  const regionIds = new Map(regions.map((region) => [region.slug, region.id]));

  const dailyRows = forecasts.flatMap((forecast) => forecast.regions.flatMap((region) => {
    const regionId = regionIds.get(region.id);
    if (!regionId) return [];
    const peak = timeRange(region.peak, "13:00", "15:00");
    const calm = timeRange(region.calm, "09:00", "11:00");
    return [{
      region_id: regionId,
      forecast_date: forecast.date,
      peak_score: region.score,
      confidence_score: region.confidence,
      confidence_level: region.confidenceLevel,
      peak_start_at: peak.start,
      peak_end_at: peak.end,
      recommended_start_at: calm.start,
      recommended_end_at: calm.end,
      top_factors: region.factors,
      weather_label: region.weather,
      event_title: region.event,
      event_meta: region.eventMeta,
      score_components: {
        ...region.scoreComponents,
        eventSourceMeta: {
          source: region.eventSource,
          name: region.eventSourceName,
          url: region.eventSourceUrl,
          imageUrl: region.eventImageUrl,
          relatedLinks: region.eventRelatedLinks,
          evidence: region.eventEvidence,
          updatedAt: region.eventUpdatedAt,
        },
      },
      algorithm_version: forecast.algorithmVersion,
      generated_at: generatedAt,
    }];
  }));

  const slotRows = forecasts.flatMap((forecast) => forecast.regions.flatMap((region) => {
    const regionId = regionIds.get(region.id);
    if (!regionId) return [];
    return region.hourly.map((score, index) => {
      const hour = region.hours[index] ?? String(index + 8).padStart(2, "0");
      return {
        region_id: regionId,
        starts_at: `${forecast.date}T${hour}:00:00+09:00`,
        score,
        risk_level: riskLevelForScore(score),
        score_components: region.scoreComponents,
        algorithm_version: forecast.algorithmVersion,
        generated_at: generatedAt,
      };
    });
  }));

  await serviceRequest<void>(config, "forecast_daily?on_conflict=region_id,forecast_date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(dailyRows),
  });
  await serviceRequest<void>(config, "forecast_slots?on_conflict=region_id,starts_at,algorithm_version", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(slotRows),
  });
  return { dates: forecasts.length, regions: dailyRows.length };
}
