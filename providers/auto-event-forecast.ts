import { clampScore, combineEventImpacts, EVENT_BONUS_WEIGHT, eventImpactScore, riskLabelForScore, riskLevelForScore } from "../domain/forecast/score.ts";
import type { PublicForecastResponse } from "../domain/forecast/types.ts";
import { classifyEventCandidate, collectEventCandidates, type EventCandidate } from "./event-discovery.ts";
import { fixtureEventAnalysis, type EventAnalysis } from "./openai-event-analysis.ts";

function overlapsDate(candidate: EventCandidate, date: string) {
  if (candidate.activeDates && candidate.activeDates.length > 0) {
    return candidate.activeDates.includes(date);
  }
  return Boolean(candidate.startDate && candidate.endDate && candidate.startDate <= date && candidate.endDate >= date);
}

function uniqueFactors(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index).slice(0, 3);
}

function eventAnalysisEvidence(candidate: EventCandidate, analysis: EventAnalysis) {
  const summary = analysis.analysisSource === "fixture" && isConcentratedPublicEvent(candidate)
    ? `${candidate.regionName}의 공개 공연 관람객이 시작 전부터 집중되고, 종료 후에도 보행·교통 혼잡이 이어질 가능성이 있습니다.`
    : analysis.summary.trim();
  const risks = uniqueFactors(analysis.riskFactors).join(" · ");
  return [summary, risks ? `주요 혼잡 요인: ${risks}` : ""].filter(Boolean).join(" ");
}

function isConcentratedPublicEvent(candidate: EventCandidate) {
  return /드론(?:라이트)?쇼|불꽃축제|나이트레이스|퍼레이드|대형 콘서트/i.test(`${candidate.title} ${candidate.sourceText}`);
}

function eventAdjustedHourlyScore(
  hourlyScore: number,
  hourLabel: string | undefined,
  adjustmentDelta: number,
  analysis: EventAnalysis,
) {
  const hour = Number(hourLabel);
  const startHour = Number(analysis.openTime.slice(0, 2));
  const endHour = Number(analysis.closeTime.slice(0, 2));
  if (!Number.isFinite(hour) || !Number.isFinite(startHour) || !Number.isFinite(endHour)) {
    return clampScore(hourlyScore + adjustmentDelta);
  }
  const factor = hour >= startHour - 1 && hour <= endHour ? 1
    : hour >= startHour - 3 && hour <= endHour + 1 ? 0.55 : 0.2;
  return clampScore(hourlyScore + adjustmentDelta * factor);
}

export function applyAutoEvents(
  forecast: PublicForecastResponse,
  candidates: EventCandidate[],
  eventUpdatedAt = forecast.asOf,
  analysisById = new Map<string, EventAnalysis>(),
): PublicForecastResponse {
  return {
    ...forecast,
    regions: forecast.regions.map((region) => {
      const events = candidates
        .filter((candidate) => candidate.regionId === region.id && overlapsDate(candidate, forecast.date))
        .map((candidate) => ({
          candidate,
          decision: classifyEventCandidate(candidate),
          analysis: analysisById.get(candidate.id) ?? fixtureEventAnalysis(candidate),
        }))
        .filter((event) => event.decision.status === "auto_approved")
        .map((event) => ({
          ...event,
          impact: eventImpactScore({
            scale: isConcentratedPublicEvent(event.candidate) && ["small", "medium", "unknown"].includes(event.analysis.scale)
              ? "large"
              : event.analysis.scale,
            limitedGoods: event.analysis.limitedGoods,
            firstCome: event.analysis.firstCome,
            numberedTickets: event.analysis.numberedTickets,
            freeAdmission: event.analysis.freeAdmission,
            nationwideAttraction: event.analysis.nationwideAttraction || isConcentratedPublicEvent(event.candidate),
            startTimeConcentration: Boolean(event.analysis.openTime),
          }),
        }))
        .sort((a, b) => b.impact - a.impact);
      if (events.length === 0) return region;

      const primary = events[0];
      const previousImpact = Number(region.scoreComponents.eventImpact) || 0;
      const nextImpact = combineEventImpacts(events.map((event) => event.impact)) * EVENT_BONUS_WEIGHT;
      const adjustmentDelta = nextImpact - previousImpact;
      const score = clampScore(region.score + adjustmentDelta);
      const eventDates = primary.candidate.activeDates?.includes(forecast.date)
        ? forecast.date
        : primary.candidate.startDate === primary.candidate.endDate
        ? primary.candidate.startDate
        : `${primary.candidate.startDate}–${primary.candidate.endDate}`;

      return {
        ...region,
        score,
        riskLevel: riskLevelForScore(score),
        riskLabel: riskLabelForScore(score),
        event: primary.candidate.title,
        eventMeta: `${primary.candidate.venue} · ${eventDates}`,
        eventSource: primary.candidate.sourceKind === "precomputed_ai" ? "stored" : "public_api",
        eventSourceName: primary.candidate.sourceName,
        eventSourceUrl: primary.candidate.sourceUrl,
        eventImageUrl: primary.candidate.imageUrl,
        eventRelatedLinks: primary.candidate.relatedLinks ?? (primary.candidate.sourceUrl ? [{
          title: primary.candidate.title,
          summary: primary.candidate.sourceText,
          source: primary.candidate.sourceName,
          url: primary.candidate.sourceUrl,
          imageUrl: primary.candidate.imageUrl,
        }] : []),
        eventEvidence: eventAnalysisEvidence(primary.candidate, primary.analysis),
        eventUpdatedAt,
        factors: uniqueFactors([...primary.analysis.riskFactors, ...region.factors]),
        hourly: region.hourly.map((hourlyScore, index) => eventAdjustedHourlyScore(
          hourlyScore,
          region.hours[index],
          adjustmentDelta,
          primary.analysis,
        )),
        scoreComponents: { ...region.scoreComponents, eventImpact: nextImpact },
      };
    }),
  };
}

export async function enrichForecastWithAutoEvents(forecast: PublicForecastResponse): Promise<PublicForecastResponse> {
  const collection = await collectEventCandidates();
  if (collection.mode !== "live") return forecast;
  return applyAutoEvents(forecast, collection.candidates, collection.generatedAt);
}
