import Link from "next/link";

import { classifyEventCandidate, collectEventCandidates } from "../../../providers/event-discovery";
import { fixtureEventAnalysis } from "../../../providers/openai-event-analysis";

export const dynamic = "force-dynamic";

function dateRange(start: string, end: string) {
  if (!start) return "기간 확인 필요";
  return start === end ? start : `${start} – ${end}`;
}

export default async function AdminValidationPage() {
  const collection = await collectEventCandidates();
  const cases = collection.candidates
    .map((candidate) => ({ candidate, decision: classifyEventCandidate(candidate), analysis: fixtureEventAnalysis(candidate) }))
    .filter((item) => item.decision.status !== "excluded")
    .slice(0, 6);
  const connectedSources = collection.sources.filter((source) => source.status === "connected").length;
  const readyCases = cases.filter((item) => item.decision.status === "auto_approved").length;

  return (
    <main className="app-shell admin-shell">
      <header className="site-header admin-header">
        <Link className="brand" href="/" aria-label="붐비 홈"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>붐비</span><span className="brand-sub">예보 검증 기록</span></Link>
        <nav className="admin-links" aria-label="관리 메뉴"><Link href="/admin/control">갱신 제어</Link><Link href="/admin/events">행사 후보</Link><Link href="/admin/jobs">갱신 이력</Link><Link className="active" href="/admin/validation">검증 기록</Link><Link href="/">예보 화면</Link></nav>
      </header>

      <section className="admin-hero validation-hero">
        <div><p className="eyebrow">FORECAST VALIDATION</p><h1>예측과 실제 관찰을,<br /><em>같은 기준으로 비교합니다.</em></h1><p>혼잡 인원수를 임의로 만들지 않습니다. 행사 전 예보를 고정하고 행사 후 위험 단계·혼잡 시간·원인 타당성을 같은 양식으로 기록합니다.</p></div>
        <div className="admin-mode-card"><span>현재 검증 대기열</span><strong>{cases.length}개 사례</strong><small>{collection.mode === "live" ? "공식 API 행사" : "구조화 분석 사례"} · 현장 관찰 전</small></div>
      </section>

      <section className="validation-summary" aria-label="검증 현황">
        <div><span>공식 소스 연결</span><strong>{connectedSources} / {collection.sources.length}</strong><small>부산축제정보·TourAPI</small></div>
        <div><span>예보 고정 완료</span><strong>{readyCases}건</strong><small>공식 API의 날짜·장소·권역 검증 통과</small></div>
        <div><span>현장 관찰 완료</span><strong>0건</strong><small>실측 전에는 정확도를 표시하지 않음</small></div>
      </section>

      <section className="validation-section">
        <div className="candidate-heading"><div><span>검증 사례</span><h2>행사 전 예보 스냅샷</h2></div><p>행사 종료 후 같은 카드에 관찰 결과와 근거 URL을 기록합니다.</p></div>
        <div className="validation-grid">{cases.map(({ candidate, decision, analysis }, index) => (
          <article className="validation-card" key={candidate.id}>
            <div className="validation-card-top"><span>CASE {String(index + 1).padStart(2, "0")}</span><i>{candidate.sourceKind === "fixture" ? "분석 사례" : "공식 API"}</i></div>
            <h3>{candidate.title}</h3><p className="validation-meta">{candidate.regionName} · {candidate.venue}<br />{dateRange(candidate.startDate, candidate.endDate)}</p>
            <dl><div><dt>사전 분석</dt><dd>{analysis.scale} · 신뢰도 {decision.confidence}</dd></div><div><dt>예상 집중</dt><dd>{analysis.openTime} 전후</dd></div><div><dt>핵심 원인</dt><dd>{analysis.riskFactors[0]}</dd></div></dl>
            <div className="observation-box"><span>현장 관찰</span><strong>아직 입력되지 않았습니다</strong><p>위험 단계 · 실제 집중 시간 · 뉴스·후기·현장 기록 URL을 행사 후 입력합니다.</p></div>
            <footer><a href={candidate.sourceUrl} target="_blank" rel="noreferrer">출처 확인 ↗</a><span>{decision.status === "auto_approved" ? "검증 대기" : "분석 검토"}</span></footer>
          </article>
        ))}</div>
      </section>

      <section className="validation-principle"><span>검증 원칙</span><h2>정확도가 없으면 없다고 표시합니다.</h2><p>완료된 현장 관찰 표본이 쌓이기 전에는 적중률을 공개하지 않습니다. 위험 단계 일치 여부, 최고 혼잡 구간 오차, 추천 시간이 최고 혼잡을 피했는지를 사례별로 기록한 뒤 집계합니다.</p></section>
    </main>
  );
}
