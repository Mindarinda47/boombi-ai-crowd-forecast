import { createDemoForecast, seoulDateKey } from "../../../../fixtures/forecast";
import { applyCalendarProfile } from "../../../../domain/forecast/calendar-profile";
import { enrichForecastWithAutoEvents } from "../../../../providers/auto-event-forecast";
import { enrichForecastWithKma } from "../../../../providers/kma-weather";
import { enrichForecastWithNaver } from "../../../../providers/naver-datalab";
import { readSupabaseForecast } from "../../../../repositories/supabase-forecast-repository";

export const dynamic = "force-dynamic";

function mergeStoredForecastWithSupportedRegions(liveForecast: ReturnType<typeof createDemoForecast>, date: string) {
  const supportedForecast = applyCalendarProfile(createDemoForecast(date));
  const storedByRegion = new Map(liveForecast.regions.map((item) => [item.id, item]));
  return {
    ...liveForecast,
    regions: supportedForecast.regions.map((item) => storedByRegion.get(item.id) ?? item),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? seoulDateKey();
  const region = url.searchParams.get("region");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
  }

  try {
    try {
      const liveForecast = await readSupabaseForecast(date, region);
      if (liveForecast) {
        const completeForecast = region ? liveForecast : mergeStoredForecastWithSupportedRegions(liveForecast, date);
        return Response.json(completeForecast, { headers: { "X-Forecast-Source": "supabase" } });
      }
    } catch {
      // The public demo remains available while Supabase is empty or temporarily unavailable.
    }

    const weatherForecast = await enrichForecastWithKma(createDemoForecast(date));
    const trendForecast = await enrichForecastWithNaver(weatherForecast);
    const forecast = applyCalendarProfile(await enrichForecastWithAutoEvents(trendForecast));
    if (!region) return Response.json(forecast, { headers: { "X-Forecast-Source": "demo-fallback" } });

    const selected = forecast.regions.find((item) => item.id === region);
    if (!selected) return Response.json({ error: "지원하지 않는 지역입니다." }, { status: 404 });
    return Response.json({ ...forecast, regions: [selected] }, { headers: { "X-Forecast-Source": "demo-fallback" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "예보를 생성하지 못했습니다.";
    return Response.json({ error: message }, { status: 400 });
  }
}
