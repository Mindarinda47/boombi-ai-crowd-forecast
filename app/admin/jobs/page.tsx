import Link from "next/link";

import { readRecentForecastJobs, type ForecastJobRun } from "../../../repositories/supabase-forecast-writer";

export const dynamic = "force-dynamic";

function formatKst(value: string | null) {
  if (!value) return "진행 중";
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

function durationLabel(job: ForecastJobRun) {
  if (!job.finished_at) return "실행 중";
  const seconds = Math.max(0, Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`;
}

function sourceLabel(job: ForecastJobRun) {
  const weather = Array.isArray(job.source_status.weather) ? job.source_status.weather.join(", ") : "확인 중";
  const trend = Array.isArray(job.source_status.trend) ? job.source_status.trend.join(", ") : "확인 중";
  const event = typeof job.source_status.event === "string" ? job.source_status.event : "확인 중";
  return `날씨 ${weather} · 검색 ${trend} · 행사 ${event}`;
}

const eventSourceNames: Record<string, string> = {
  visit_busan: "Visit Busan",
  busan_festival: "부산축제정보",
  tour_api: "TourAPI",
  naver_search: "NAVER API HUB",
  precomputed_ai: "저장 결과",
};

function eventSourceDetails(job: ForecastJobRun) {
  const raw = job.source_status.eventDiscovery;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).map(([id, value]) => {
    if (typeof value === "string") {
      return { id, name: eventSourceNames[id] ?? id, status: value, message: "상세 사유는 다음 갱신부터 기록" };
    }
    const detail = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      id,
      name: eventSourceNames[id] ?? id,
      status: typeof detail.status === "string" ? detail.status : "unknown",
      message: typeof detail.message === "string" ? detail.message : "상세 정보 없음",
    };
  });
}

function eventProcessingLabel(job: ForecastJobRun) {
  const value = job.source_status.eventStats;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "행사 처리 내역 없음";
  const stats = value as Record<string, unknown>;
  if (typeof stats.aiAttempted !== "number") return "이전 형식 기록 · 다음 갱신부터 AI·규칙 처리를 구분";
  return `AI 시도 ${stats.aiAttempted ?? 0}건 · 성공 ${stats.analyzed ?? 0}건 · 규칙 처리 ${stats.ruleProcessed ?? 0}건 · 재사용 ${stats.reused ?? 0}건`;
}

function reviewReasonLabel(job: ForecastJobRun) {
  const stats = job.source_status.eventStats;
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "";
  const reasons = (stats as Record<string, unknown>).reviewReasons;
  if (!reasons || typeof reasons !== "object" || Array.isArray(reasons)) return "";
  return Object.entries(reasons as Record<string, unknown>)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number" && entry[1] > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason} ${count}건`)
    .join(" · ");
}

export default async function AdminJobsPage() {
  let jobs: ForecastJobRun[] = [];
  let loadFailed = false;
  try {
    jobs = await readRecentForecastJobs(30);
  } catch {
    loadFailed = true;
  }
  const completed = jobs.filter((job) => job.status !== "running");
  const succeeded = completed.filter((job) => job.status === "succeeded").length;
  const latest = jobs[0];
  const successRate = completed.length > 0 ? Math.round(succeeded / completed.length * 100) : 0;
  const statusLabel = { running: "실행 중", succeeded: "성공", failed: "실패" } as const;

  return (
    <main className="app-shell admin-shell">
      <header className="site-header admin-header">
        <Link className="brand" href="/" aria-label="붐비 홈"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>붐비</span><span className="brand-sub">자동 갱신 이력</span></Link>
        <nav className="admin-links" aria-label="관리 메뉴"><Link href="/admin/control">갱신 제어</Link><Link href="/admin/events">행사 후보</Link><Link className="active" href="/admin/jobs">갱신 이력</Link><Link href="/admin/validation">검증 기록</Link><Link href="/">예보 화면</Link></nav>
      </header>

      <section className="admin-hero jobs-hero">
        <div><p className="eyebrow">FORECAST OPERATIONS</p><h1>하루 두 번의 갱신을,<br /><em>결과로 확인합니다.</em></h1><p>06:00·15:00 KST 자동 작업에서 날씨·검색·민간 행사·혼잡 점수를 같은 기준 시각으로 갱신합니다.</p></div>
        <div className="admin-mode-card"><span>최근 완료 작업</span><strong>성공률 {successRate}%</strong><small>{completed.length}회 중 {succeeded}회 성공</small></div>
      </section>

      <section className="job-summary" aria-label="자동 갱신 요약">
        <div><span>최근 상태</span><strong className={latest ? `job-${latest.status}` : ""}>{latest ? statusLabel[latest.status] : "기록 없음"}</strong><small>{latest ? formatKst(latest.started_at) : "첫 실행 대기"}</small></div>
        <div><span>최근 처리 범위</span><strong>{latest?.forecast_dates ?? 0}일 · {latest?.regions_written ?? 0}건</strong><small>오늘부터 7일 뒤 예보</small></div>
        <div><span>공식 행사 반영</span><strong>{latest?.public_events_applied ?? 0}건</strong><small>최근 자동 갱신 기준</small></div>
      </section>

      <section className="job-section">
        <div className="candidate-heading"><div><span>최근 실행 기록</span><h2>자동 갱신 작업 최대 30회</h2></div><p>실패 시 오류 원인을 남기고 다음 예약 실행에서 다시 계산합니다.</p></div>
        {loadFailed ? <div className="job-empty">작업 이력을 불러오지 못했습니다. Supabase 연결 상태를 확인해 주세요.</div> : jobs.length === 0 ? <div className="job-empty">아직 저장된 자동 갱신 이력이 없습니다.</div> : (
          <div className="job-table-wrap"><table className="job-table"><thead><tr><th>상태</th><th>시작 시각</th><th>소요</th><th>처리 결과</th><th>데이터 소스</th></tr></thead><tbody>{jobs.map((job) => (
            <tr key={job.id}>
              <td><span className={`job-status job-${job.status}`}>{statusLabel[job.status]}</span></td>
              <td>{formatKst(job.started_at)}<small>{job.trigger_source === "manual" ? "수동 실행" : "예약 실행"}</small></td>
              <td>{durationLabel(job)}</td>
              <td>{job.status === "failed" ? <span className="job-error">{job.error_message || "오류 내용 없음"}</span> : <>{job.forecast_dates}일 · {job.regions_written}건<small>공식 행사 {job.public_events_applied}건</small><small>{eventProcessingLabel(job)}</small>{reviewReasonLabel(job) && <small className="job-warning">반영 제외 · {reviewReasonLabel(job)}</small>}</>}</td>
              <td>{sourceLabel(job)}<div className="job-source-list">{eventSourceDetails(job).map((source) => <span className={`source-${source.status}`} key={source.id}><b>{source.name}</b> · {source.message}</span>)}</div></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>
    </main>
  );
}
