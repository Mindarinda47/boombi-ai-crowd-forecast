import { classifyEventCandidate, collectEventCandidates, eventCandidateFingerprint, regionFromText, type EventCandidate } from "./event-discovery.ts";
import { analyzeEventCandidate, fixtureEventAnalysis, type EventAnalysis } from "./openai-event-analysis.ts";
import { hasConfiguredAiProvider } from "./ai-runtime.ts";
import {
  readEventDiscoveryRecords,
  writeEventDiscoveryRecords,
  type EventDiscoveryRecord,
} from "../repositories/supabase-forecast-writer.ts";

export type EventRefreshResult = {
  candidates: EventCandidate[];
  analysisById: Map<string, EventAnalysis>;
  refreshedAt: string;
  sourceStatus: Record<string, { status: string; candidateCount: number; message: string }>;
  stats: {
    discovered: number;
    newRecords: number;
    changedRecords: number;
    analyzed: number;
    aiAttempted: number;
    aiFallback: number;
    ruleProcessed: number;
    reused: number;
    autoApproved: number;
    needsReview: number;
    reviewReasons: Record<string, number>;
  };
};

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function normalizeWithAnalysis(candidate: EventCandidate, analysis: EventAnalysis): EventCandidate {
  const title = analysis.title.trim() || candidate.title;
  const venue = analysis.venueName.trim() || candidate.venue;
  const inferredRegion = regionFromText(`${title} ${venue} ${candidate.sourceText}`);
  return {
    ...candidate,
    title,
    venue,
    regionId: candidate.regionId ?? inferredRegion.id,
    regionName: candidate.regionId ? candidate.regionName : inferredRegion.name,
    startDate: validDate(analysis.startDate) || candidate.startDate,
    endDate: validDate(analysis.endDate) || candidate.endDate || validDate(analysis.startDate) || candidate.startDate,
    activeDates: analysis.activeDates?.filter(validDate).length
      ? analysis.activeDates.filter(validDate)
      : candidate.activeDates,
  };
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T, index: number) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function refreshEventDiscovery(
  refreshedAt = new Date().toISOString(),
  options?: { aiAnalysisEnabled?: boolean; maxLiveAnalyses?: number },
): Promise<EventRefreshResult> {
  const collection = await collectEventCandidates();
  const stored = await readEventDiscoveryRecords().catch(() => []);
  const storedByKey = new Map(stored.map((record) => [record.source_key, record]));
  const liveAnalysis = options?.aiAnalysisEnabled !== false
    && process.env.AI_ANALYSIS_MODE === "live"
    && hasConfiguredAiProvider();
  const configuredLimit = options?.maxLiveAnalyses ?? (Number(process.env.AI_EVENT_MAX_ANALYSES_PER_RUN) || 20);
  const maxLiveAnalyses = Math.max(1, Math.min(20, Math.round(configuredLimit)));
  let liveAnalysisCount = 0;
  let newRecords = 0;
  let changedRecords = 0;
  let aiAttempted = 0;
  let analyzed = 0;
  let aiFallback = 0;
  let ruleProcessed = 0;
  let reused = 0;

  const orderedCandidates = [...collection.candidates].sort((left, right) => {
    const statusPriority = { needs_review: 0, auto_approved: 1, excluded: 2 };
    const statusDifference = statusPriority[classifyEventCandidate(left).status] - statusPriority[classifyEventCandidate(right).status];
    const privateSourceDifference = Number(right.sourceKind === "naver_search") - Number(left.sourceKind === "naver_search");
    return statusDifference || privateSourceDifference
      || (left.startDate || "9999-12-31").localeCompare(right.startDate || "9999-12-31");
  });

  const prepared = await mapWithConcurrency(orderedCandidates, 4, async (candidate) => {
    const contentHash = eventCandidateFingerprint(candidate);
    const previous = storedByKey.get(candidate.id);
    const candidateStatus = classifyEventCandidate(candidate).status;
    const changed = Boolean(previous && previous.content_hash !== contentHash);
    const needsUpgrade = Boolean(liveAnalysis && !["gemini", "groq"].includes(previous?.analysis.analysisSource ?? "fixture"));
    const needsAnalysis = !previous || changed || needsUpgrade;
    if (!previous) newRecords += 1;
    else if (changed) changedRecords += 1;

    let analysis = previous?.analysis;
    if (needsAnalysis && candidateStatus !== "excluded" && liveAnalysis && liveAnalysisCount < maxLiveAnalyses) {
      liveAnalysisCount += 1;
      aiAttempted += 1;
      analysis = await analyzeEventCandidate(candidate, true);
      if (["gemini", "groq"].includes(analysis.analysisSource)) analyzed += 1;
      else {
        aiFallback += 1;
        ruleProcessed += 1;
      }
    } else if (needsAnalysis) {
      analysis = fixtureEventAnalysis(candidate);
      ruleProcessed += 1;
    } else if (analysis) {
      reused += 1;
    }
    analysis ??= fixtureEventAnalysis(candidate);

    const normalized = normalizeWithAnalysis(candidate, analysis);
    const decision = classifyEventCandidate(normalized);
    const record: EventDiscoveryRecord = {
      source_key: candidate.id,
      content_hash: contentHash,
      candidate: normalized,
      analysis,
      decision_status: decision.status,
      first_seen_at: previous?.first_seen_at ?? refreshedAt,
      last_seen_at: refreshedAt,
      analyzed_at: needsAnalysis ? refreshedAt : previous?.analyzed_at ?? refreshedAt,
    };
    return record;
  });

  await writeEventDiscoveryRecords(prepared).catch(() => undefined);
  const candidates = prepared.map((record) => record.candidate);
  const decisions = candidates.map((candidate) => classifyEventCandidate(candidate));
  const reviewReasons = decisions
    .filter((decision) => decision.status === "needs_review")
    .flatMap((decision) => decision.reasons)
    .reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
  return {
    candidates,
    analysisById: new Map(prepared.map((record) => [record.candidate.id, record.analysis])),
    refreshedAt,
    sourceStatus: Object.fromEntries(collection.sources.map((source) => [source.id, {
      status: source.status,
      candidateCount: source.candidateCount,
      message: source.message,
    }])),
    stats: {
      discovered: candidates.length,
      newRecords,
      changedRecords,
      analyzed,
      aiAttempted,
      aiFallback,
      ruleProcessed,
      reused,
      autoApproved: decisions.filter((decision) => decision.status === "auto_approved").length,
      needsReview: decisions.filter((decision) => decision.status === "needs_review").length,
      reviewReasons,
    },
  };
}
