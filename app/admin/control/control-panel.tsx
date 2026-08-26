"use client";

import { useEffect, useState } from "react";

type ControlSettings = {
  auto_refresh_enabled: boolean;
  ai_analysis_enabled: boolean;
  ai_decision_enabled: boolean;
  max_ai_analyses_per_run: number;
  refresh_in_progress: boolean;
  refresh_started_at: string | null;
  last_manual_refresh_at: string | null;
  last_schedule_refresh_at: string | null;
  last_finished_at: string | null;
  updated_at: string;
  updated_by: string | null;
  storage_ready: boolean;
};

type JobSummary = {
  id: string;
  status: "running" | "succeeded" | "failed";
  trigger_source: string;
  started_at: string;
  finished_at: string | null;
  regions_written: number;
};

type ProcessState = "idle" | "running" | "succeeded" | "failed";

type RefreshResponse = {
  error?: string;
  message?: string;
  regions?: number;
  publicEventsApplied?: number;
  refreshedAt?: string;
  eventStats?: { aiAttempted?: number; analyzed?: number; ruleProcessed?: number; reused?: number };
  sourceStatus?: { eventDiscovery?: Record<string, { status?: string; candidateCount?: number; message?: string }> };
};

const refreshSourceNames: Record<string, string> = {
  visit_busan: "Visit Busan",
  busan_festival: "부산축제정보",
  tour_api: "TourAPI",
  naver_search: "NAVER API HUB",
  precomputed_ai: "저장 결과",
};

const refreshStages = [
  { title: "행사 변화 확인", description: "행사 원문과 기존 분석 기록을 비교합니다." },
  { title: "외부 신호 수집", description: "날씨와 검색 추세를 최신 상태로 맞춥니다." },
  { title: "혼잡 예보 계산", description: "8일·42개 권역의 시간대별 점수를 계산합니다." },
  { title: "결과 저장", description: "예보와 출처, 마지막 갱신 시각을 저장합니다." },
] as const;

function formatKst(value: string | null) {
  if (!value) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function ForecastControlPanel({
  initialSettings,
  recentJobs,
  capabilities,
}: {
  initialSettings: ControlSettings;
  recentJobs: JobSummary[];
  capabilities: { analysisReady: boolean; decisionReady: boolean; providerSummary: string };
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState(initialSettings);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(initialSettings.refresh_in_progress);
  const [processState, setProcessState] = useState<ProcessState>(initialSettings.refresh_in_progress ? "running" : "idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(() => initialSettings.refresh_in_progress && initialSettings.refresh_started_at
    ? Math.max(0, Math.floor((Date.now() - new Date(initialSettings.refresh_started_at).getTime()) / 1000)) : 0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (processState !== "running") return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [processState]);

  async function saveSettings() {
    const enablingAutomatic = !settings.auto_refresh_enabled && draft.auto_refresh_enabled;
    if (enablingAutomatic && !window.confirm("매일 06:00·15:00 자동 갱신을 켤까요? 실제 외부 API와 AI 설정이 활성화되어 있으면 사용량이 발생할 수 있습니다.")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/forecast-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoRefreshEnabled: draft.auto_refresh_enabled,
          aiAnalysisEnabled: draft.ai_analysis_enabled,
          aiDecisionEnabled: draft.ai_decision_enabled,
          maxAiAnalysesPerRun: draft.max_ai_analyses_per_run,
          confirmAutomatic: enablingAutomatic,
        }),
      });
      const body = await response.json() as { error?: string; settings?: ControlSettings };
      if (!response.ok || !body.settings) throw new Error(body.error || "설정을 저장하지 못했습니다.");
      setSettings(body.settings);
      setDraft(body.settings);
      setNotice("관리자 설정을 저장했습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설정을 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function runManualRefresh() {
    if (!window.confirm("지금 예보 데이터 전체를 한 번 갱신할까요? AI 행사 분석이 켜져 있으면 설정된 상한 안에서만 호출됩니다.")) return;
    setRunning(true);
    setProcessState("running");
    setElapsedSeconds(0);
    setError("");
    setNotice("예보를 갱신하고 있습니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/internal/refresh-forecast", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-refresh-trigger": "manual" },
        body: "{}",
      });
      const body = await response.json() as RefreshResponse;
      if (!response.ok) throw new Error(body.error || body.message || "수동 갱신에 실패했습니다.");
      setProcessState("succeeded");
      const sources = Object.entries(body.sourceStatus?.eventDiscovery ?? {})
        .map(([id, source]) => `${refreshSourceNames[id] ?? id}: ${source.message ?? source.status ?? "확인 중"}`)
        .join(" · ");
      const ai = body.eventStats
        ? `AI 시도 ${body.eventStats.aiAttempted ?? 0}건 · 성공 ${body.eventStats.analyzed ?? 0}건 · 규칙 처리 ${body.eventStats.ruleProcessed ?? 0}건 · 재사용 ${body.eventStats.reused ?? 0}건`
        : "";
      setNotice(`수동 갱신 완료 · ${body.regions ?? 0}개 지역·일자 저장 · 공식 행사 ${body.publicEventsApplied ?? 0}건 반영\n${sources}${ai ? `\n${ai}` : ""}`);
      setSettings((current) => ({ ...current, refresh_in_progress: false, last_finished_at: body.refreshedAt ?? new Date().toISOString() }));
    } catch (caught) {
      setProcessState("failed");
      setError(caught instanceof Error ? caught.message : "수동 갱신에 실패했습니다.");
      setNotice("");
    } finally {
      setRunning(false);
    }
  }

  const changed = draft.auto_refresh_enabled !== settings.auto_refresh_enabled
    || draft.ai_analysis_enabled !== settings.ai_analysis_enabled
    || draft.ai_decision_enabled !== settings.ai_decision_enabled
    || draft.max_ai_analyses_per_run !== settings.max_ai_analyses_per_run;
  const activeStage = processState === "running" ? Math.min(refreshStages.length - 1, Math.floor(elapsedSeconds / 5)) : 0;
  const progressPercent = processState === "succeeded" ? 100
    : processState === "idle" ? 0
      : Math.min(92, ((activeStage + 0.55) / refreshStages.length) * 100);
  const processLabel = processState === "running" ? `${elapsedSeconds}초 실행 중`
    : processState === "succeeded" ? "갱신 완료"
      : processState === "failed" ? "확인 필요" : "실행 대기";

  return (
    <>
      {!settings.storage_ready && (
        <div className="control-warning" role="alert">
          <strong>Supabase 제어 설정 준비가 필요합니다.</strong>
          <p>마이그레이션 SQL을 한 번 실행하면 저장과 수동 갱신 버튼이 활성화됩니다. 준비 전에는 예약 요청도 안전하게 차단됩니다.</p>
        </div>
      )}

      <section className="control-grid" aria-label="예보 갱신 설정">
        <article className="control-card control-card-primary">
          <div className="control-card-heading"><div><span>REFRESH MODE</span><h2>자동 갱신</h2></div><b className={draft.auto_refresh_enabled ? "is-on" : "is-off"}>{draft.auto_refresh_enabled ? "ON" : "OFF"}</b></div>
          <p>OFF이면 06:00·15:00 예약 요청이 들어와도 데이터와 AI를 호출하기 전에 종료합니다.</p>
          <label className="control-switch"><input type="checkbox" checked={draft.auto_refresh_enabled} disabled={!settings.storage_ready || saving || running} onChange={(event) => setDraft({ ...draft, auto_refresh_enabled: event.target.checked })} /><span aria-hidden="true" /><strong>{draft.auto_refresh_enabled ? "예약 갱신 사용" : "수동 갱신 모드"}</strong></label>
        </article>

        <article className="control-card">
          <div className="control-card-heading"><div><span>EVENT ANALYSIS</span><h2>AI 행사 구조화</h2></div><b className={draft.ai_analysis_enabled ? "is-on" : "is-off"}>{draft.ai_analysis_enabled ? "ON" : "OFF"}</b></div>
          <p>새 행사 또는 변경된 행사만 분석합니다. 같은 원문은 저장 결과를 재사용합니다.</p>
          <label className="control-switch"><input type="checkbox" checked={draft.ai_analysis_enabled} disabled={!settings.storage_ready || !capabilities.analysisReady || saving || running} onChange={(event) => setDraft({ ...draft, ai_analysis_enabled: event.target.checked })} /><span aria-hidden="true" /><strong>{capabilities.analysisReady ? `${capabilities.providerSummary} 분석 허용` : "API 환경 설정 전"}</strong></label>
          <label className="control-limit"><span>한 번에 분석할 최대 행사</span><select value={draft.max_ai_analyses_per_run} disabled={!settings.storage_ready || saving || running} onChange={(event) => setDraft({ ...draft, max_ai_analyses_per_run: Number(event.target.value) })}>{[1, 3, 5, 10, 20].map((value) => <option key={value} value={value}>{value}건</option>)}</select></label>
        </article>

        <article className="control-card">
          <div className="control-card-heading"><div><span>DECISION TOOLS</span><h2>AI 선택 도구</h2></div><b className={draft.ai_decision_enabled ? "is-on" : "is-off"}>{draft.ai_decision_enabled ? "ON" : "OFF"}</b></div>
          <p>대체 장소와 조건 비교의 계산 결과는 유지하고, AI는 설명 문장만 보강합니다.</p>
          <label className="control-switch"><input type="checkbox" checked={draft.ai_decision_enabled} disabled={!settings.storage_ready || !capabilities.decisionReady || saving || running} onChange={(event) => setDraft({ ...draft, ai_decision_enabled: event.target.checked })} /><span aria-hidden="true" /><strong>{capabilities.decisionReady ? `${capabilities.providerSummary} 설명 보강 허용` : "API 환경 설정 전"}</strong></label>
        </article>
      </section>

      <section className="control-actions">
        <div><span>설정 변경</span><strong>{changed ? "저장하지 않은 변경이 있습니다." : "현재 설정이 저장되어 있습니다."}</strong><small>마지막 저장 {formatKst(settings.updated_at)}{settings.updated_by ? ` · ${settings.updated_by}` : ""}</small></div>
        <button className="control-save" type="button" disabled={!settings.storage_ready || !changed || saving || running} onClick={saveSettings}>{saving ? "저장 중…" : "설정 저장"}</button>
        <button className="control-run" type="button" disabled={!settings.storage_ready || running || saving || changed} onClick={runManualRefresh}><span aria-hidden="true">▶</span>{running ? "갱신 실행 중…" : "지금 한 번 갱신"}</button>
      </section>

      {(notice || error) && <p className={error ? "control-message error" : "control-message"} role="status">{error || notice}</p>}

      <section className={`control-process ${processState}`} aria-label="예보 갱신 처리 과정" aria-live="polite">
        <div className="control-process-heading">
          <div><span>REFRESH PIPELINE</span><h2>예보 갱신 처리 과정</h2><p>실행 중에는 데이터가 예보로 변환되는 흐름을 단계별로 표시합니다.</p></div>
          <strong><i aria-hidden="true" />{processLabel}</strong>
        </div>
        <div className="control-process-progress" aria-hidden="true"><span style={{ width: `${progressPercent}%` }} /></div>
        <div className="control-process-track">
          {refreshStages.map((stage, index) => {
            const stageState = processState === "succeeded" || (processState === "running" && index < activeStage)
              ? "done" : processState === "running" && index === activeStage
                ? "active" : processState === "failed" && index === activeStage ? "failed" : "pending";
            return (
              <article className={stageState} key={stage.title}>
                <span>{stageState === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
                <div><strong>{stage.title}</strong><p>{stage.description}</p>{index === 0 && <small>AI 분석 상한 {draft.max_ai_analyses_per_run}건 · 기존 결과 재사용</small>}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="control-status-grid" aria-label="안전장치와 실행 상태">
        <article><span>01</span><strong>중복 실행 차단</strong><p>한 번에 한 작업만 실행하며, 비정상 작업 잠금은 15분 뒤 해제합니다.</p></article>
        <article><span>02</span><strong>60초 재실행 제한</strong><p>실수로 버튼을 연속 클릭해도 외부 API가 반복 호출되지 않습니다.</p></article>
        <article><span>03</span><strong>AI 건수 상한</strong><p>한 번의 갱신에서 설정한 행사 수를 넘겨 외부 AI를 호출하지 않습니다.</p></article>
        <article><span>04</span><strong>서버 설정 이중 확인</strong><p>관리자 토글과 배포 환경 설정이 모두 켜져야 AI가 실제 호출됩니다.</p></article>
      </section>

      <section className="control-history">
        <div className="candidate-heading"><div><span>최근 실행</span><h2>마지막 갱신 결과</h2></div><p>상세 기록은 갱신 이력 화면에서 확인할 수 있습니다.</p></div>
        {recentJobs.length === 0 ? <div className="job-empty">아직 저장된 갱신 이력이 없습니다.</div> : <div className="control-job-list">{recentJobs.map((job) => <article key={job.id}><i className={`job-${job.status}`} /> <div><strong>{job.trigger_source === "manual" ? "수동 갱신" : "예약 갱신"}</strong><small>{formatKst(job.started_at)} · {job.regions_written}건 저장</small></div><b>{job.status === "succeeded" ? "성공" : job.status === "failed" ? "실패" : "실행 중"}</b></article>)}</div>}
      </section>
    </>
  );
}
