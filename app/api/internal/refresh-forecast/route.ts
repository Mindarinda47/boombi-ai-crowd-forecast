import { dateKeyForOffset, createDemoForecast } from "../../../../fixtures/forecast.ts";
import { applyCalendarProfile } from "../../../../domain/forecast/calendar-profile.ts";
import { applyAutoEvents } from "../../../../providers/auto-event-forecast.ts";
import { refreshEventDiscovery } from "../../../../providers/event-refresh.ts";
import { enrichForecastWithKma } from "../../../../providers/kma-weather.ts";
import { enrichForecastWithNaver } from "../../../../providers/naver-datalab.ts";
import {
  acquireForecastRefreshLock,
  finishForecastJob,
  isRefreshAuthorized,
  releaseForecastRefreshLock,
  startForecastJob,
  writeForecastSnapshots,
} from "../../../../repositories/supabase-forecast-writer.ts";
import { getForecastAdmin } from "../../../../lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const triggerSource = request.headers.get("x-refresh-trigger") === "manual" ? "manual" : "schedule";
  const authorized = isRefreshAuthorized(request)
    || (triggerSource === "manual" && Boolean(await getForecastAdmin()));
  if (!authorized) {
    return Response.json({ error: "예보 갱신 요청을 인증하지 못했습니다." }, { status: 401 });
  }

  const lock = await acquireForecastRefreshLock(triggerSource);
  if (!lock.acquired) {
    const status = lock.reason === "already_running" ? 409
      : lock.reason === "manual_cooldown" ? 429
        : lock.reason === "storage_unavailable" ? 503 : 200;
    const messages = {
      automatic_disabled: "자동 갱신이 꺼져 있어 예약 실행을 건너뛰었습니다.",
      already_running: "이미 예보 갱신이 실행 중입니다.",
      manual_cooldown: "연속 실행 방지를 위해 60초 후 다시 시도해 주세요.",
      storage_unavailable: "관리자 제어 설정 저장소를 먼저 준비해 주세요.",
    } as const;
    return Response.json({
      ok: lock.reason === "automatic_disabled",
      skipped: true,
      reason: lock.reason,
      message: messages[lock.reason],
    }, { status, headers: lock.reason === "manual_cooldown" ? { "Retry-After": "60" } : undefined });
  }

  const refreshStartedAt = new Date().toISOString();
  let jobId = "";
  try {
    jobId = await startForecastJob(triggerSource);
    const eventRefresh = await refreshEventDiscovery(refreshStartedAt, {
      aiAnalysisEnabled: lock.settings.ai_analysis_enabled,
      maxLiveAnalyses: lock.settings.max_ai_analyses_per_run,
    });
    const forecasts = [];
    for (let offset = 0; offset < 8; offset += 1) {
      const weatherForecast = await enrichForecastWithKma(createDemoForecast(dateKeyForOffset(offset)));
      const trendForecast = await enrichForecastWithNaver(weatherForecast);
      const eventForecast = applyAutoEvents(
        trendForecast,
        eventRefresh.candidates,
        refreshStartedAt,
        eventRefresh.analysisById,
      );
      const forecast = applyCalendarProfile(eventForecast);
      forecasts.push({ ...forecast, mode: "live" as const, asOf: refreshStartedAt });
    }
    const written = await writeForecastSnapshots(forecasts, refreshStartedAt);
    const publicEventsApplied = new Set(forecasts.flatMap((forecast) => forecast.regions
      .filter((region) => region.eventSource === "public_api")
      .map((region) => `${region.eventSourceUrl || region.eventSourceName}|${region.event}`)))
      .size;
    const sourceStatus = {
      weather: [...new Set(forecasts.map((forecast) => forecast.weatherSource))],
      trend: [...new Set(forecasts.map((forecast) => forecast.trendSource))],
      event: publicEventsApplied > 0 ? "public_api" : "no_matching_event",
      eventDiscovery: eventRefresh.sourceStatus,
      eventStats: eventRefresh.stats,
      refreshedAt: refreshStartedAt,
    };
    await finishForecastJob(jobId, {
      status: "succeeded",
      forecast_dates: written.dates,
      regions_written: written.regions,
      public_events_applied: publicEventsApplied,
      source_status: sourceStatus,
    });
    return Response.json({ ok: true, ...written, publicEventsApplied, eventStats: eventRefresh.stats, refreshedAt: refreshStartedAt, sourceStatus });
  } catch (error) {
    const message = error instanceof Error ? error.message : "자동 갱신에 실패했습니다.";
    if (jobId) await finishForecastJob(jobId, { status: "failed", error_message: message }).catch(() => undefined);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await releaseForecastRefreshLock().catch(() => undefined);
  }
}
